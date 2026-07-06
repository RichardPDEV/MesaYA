package com.example.reservas.service;

import com.example.reservas.domain.*;
import com.example.reservas.dto.CreateReservationRequest;
import com.example.reservas.dto.ReservationResponse;
import com.example.reservas.repo.CancellationPolicyRepository;
import com.example.reservas.repo.ReservationRepository;
import com.example.reservas.repo.ResourceRepository;
import com.example.reservas.service.UserService;
import com.example.reservas.service.cache.CacheKeys;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.List;

@Service
public class ReservationService {

    private final ReservationRepository reservationRepo;
    private final ResourceRepository resourceRepo;
    private final CancellationPolicyRepository cancellationPolicyRepo;
    private final CacheManager cacheManager;
    private final UserService userService;

    public ReservationService(ReservationRepository reservationRepo,
                              ResourceRepository resourceRepo,
                              CancellationPolicyRepository cancellationPolicyRepo,
                              CacheManager cacheManager,
                              UserService userService) {
        this.reservationRepo = reservationRepo;
        this.resourceRepo = resourceRepo;
        this.cancellationPolicyRepo = cancellationPolicyRepo;
        this.cacheManager = cacheManager;
        this.userService = userService;
    }

    /**
     * Create: valida, persiste y limpia caché de availability para los días impactados (UTC).
     * Claves de caché unificadas vía CacheKeys.availKey(resourceId, LocalDate).
     */
    public ReservationResponse create(CreateReservationRequest req) {
        return create(req, null);
    }

    @Caching(evict = {
        @CacheEvict(cacheNames = "availability",
                    key = "T(com.example.reservas.service.cache.CacheKeys).availKey(#req.resourceId(), #root.target.dayDate(#req.startTime()))"),
        @CacheEvict(cacheNames = "availability",
                    key = "T(com.example.reservas.service.cache.CacheKeys).availKey(#req.resourceId(), #root.target.dayDate(#req.endTime()))",
                    condition = "#root.target.dayDate(#req.startTime()) != #root.target.dayDate(#req.endTime())")
    })
    @Transactional
    public ReservationResponse create(CreateReservationRequest req, String currentUsername) {
        if (req.startTime().isAfter(req.endTime()) || req.startTime().isEqual(req.endTime())) {
            throw new ValidationException("startTime debe ser < endTime");
        }

        Resource resource = resourceRepo.findById(req.resourceId())
                .orElseThrow(() -> new NotFoundException("Resource %d no existe".formatted(req.resourceId())));

        User user = null;
        if (currentUsername != null && !currentUsername.isBlank()) {
            user = userService.findByUsername(currentUsername)
                    .orElseThrow(() -> new NotFoundException("Usuario %s no existe".formatted(currentUsername)));
        }

        if (req.partySize() > resource.getCapacity()) {
            throw new ValidationException("partySize excede la capacidad del recurso");
        }

        List<Reservation> overlaps = reservationRepo.findOverlaps(resource.getId(), req.tableId(), req.startTime(), req.endTime());
        if (!overlaps.isEmpty()) {
            throw new ValidationException("Ya existe una reserva que solapa ese horario");
        }

        Reservation r = new Reservation();
        r.setResource(resource);
        r.setUser(user);
        if (user != null) {
            r.setCustomerName(user.getDisplayName());
            r.setCustomerEmail(user.getUsername());
        } else {
            r.setCustomerName(req.customerName());
            r.setCustomerEmail(req.customerEmail());
        }
        r.setPartySize(req.partySize());
        r.setTableId(req.tableId());
        r.setStartTime(req.startTime());
        r.setEndTime(req.endTime());
        r.setStatus(ReservationStatus.CONFIRMED);

        Reservation saved = reservationRepo.saveAndFlush(r);
        // Acceder al resource dentro de la transacción para evitar LazyInitializationException
        Long resourceId = saved.getResource().getId();
        return toResponse(saved, resourceId);
    }

    /**
     * Cancel: clasifica FREE vs LATE según CancellationPolicy y limpia caché de availability (UTC).
     */
    @Transactional
    public ReservationResponse cancel(Long id, String reason, OffsetDateTime now, String currentUsername) {
        Reservation r = getEntityForCurrentUser(id, currentUsername);

        if (r.getStatus() != ReservationStatus.CONFIRMED) {
            throw new ValidationException("Reserva no está en estado CONFIRMED");
        }

        CancellationClass classification = classifyCancellation(r, now);
        if (classification == CancellationClass.FREE) {
            r.setStatus(ReservationStatus.CANCELLED);
        } else {
            r.setStatus(ReservationStatus.LATE_CANCELLED);
        }
        r.setCancellationReason(reason);

        Reservation saved = reservationRepo.saveAndFlush(r);
        
        // Acceder al resource dentro de la transacción para evitar LazyInitializationException
        Long resourceId = saved.getResource().getId();

        // Evict availability cache para el día de inicio y (si aplica) el de fin, normalizados a UTC
        var cache = cacheManager.getCache("availability");
        if (cache != null) {
            LocalDate startDay = dayDate(saved.getStartTime());
            LocalDate endDay = dayDate(saved.getEndTime());
            cache.evict(CacheKeys.availKey(resourceId, startDay));
            if (!startDay.equals(endDay)) {
                cache.evict(CacheKeys.availKey(resourceId, endDay));
            }
        }

        return toResponse(saved, resourceId);
    }

    /**
     * Clasificación FREE vs LATE según política y tiempo actual.
     */
    public CancellationClass classifyCancellation(Reservation r, OffsetDateTime now) {
        CancellationPolicy policy = cancellationPolicyRepo
                .findFirstByBusinessId(r.getResource().getBusiness().getId())
                .orElse(null);
        Integer freeBeforeInt = (policy != null ? policy.getFreeBeforeMinutes() : null);
        int freeBefore = (freeBeforeInt == null ? 0 : freeBeforeInt);

        long minutesBefore = Duration.between(now, r.getStartTime()).toMinutes();
        return (minutesBefore >= freeBefore) ? CancellationClass.FREE : CancellationClass.LATE;
    }

    /**
     * Lista paginada para rango de día (útil para consultas internas).
     */
    public Page<Reservation> listPage(Long resourceId, OffsetDateTime start, OffsetDateTime end, Pageable pageable) {
        return reservationRepo.findForDayPage(resourceId, start, end, pageable);
    }

    public List<ReservationResponse> listByUser(String username) {
        if (username == null || username.isBlank()) {
            throw new ValidationException("Usuario autenticado es requerido");
        }
        User user = userService.findByUsername(username)
                .orElseThrow(() -> new NotFoundException("Usuario %s no existe".formatted(username)));
        return reservationRepo.findByUserId(user.getId()).stream()
                .map(r -> toResponse(r, r.getResource().getId()))
                .toList();
    }

    @Transactional(readOnly = true)
    public Reservation getEntityForCurrentUser(Long id, String currentUsername) {
        if (currentUsername == null || currentUsername.isBlank()) {
            throw new org.springframework.security.access.AccessDeniedException("Autenticación requerida");
        }

        Reservation reservation = getEntity(id);
        if (reservation.getUser() == null) {
            throw new org.springframework.security.access.AccessDeniedException("No tienes acceso a esta reserva");
        }

        User currentUser = userService.findByUsername(currentUsername)
                .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException("Autenticación requerida"));

        if (!currentUser.getId().equals(reservation.getUser().getId())) {
            throw new org.springframework.security.access.AccessDeniedException("No tienes acceso a esta reserva");
        }

        return reservation;
    }

    /**
     * Dev A: Consulta de reservas por fecha (coherente con día UTC).
     */
    @Transactional(readOnly = true)
    public List<ReservationResponse> listForDay(Long resourceId, LocalDate date) {
        if (resourceId == null) throw new ValidationException("resourceId es requerido");
        if (date == null) throw new ValidationException("date es requerido");

        resourceRepo.findById(resourceId)
                .orElseThrow(() -> new NotFoundException("Resource %d no existe".formatted(resourceId)));

        OffsetDateTime start = date.atStartOfDay().atOffset(ZoneOffset.UTC);
        OffsetDateTime end = date.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC);
        var page = reservationRepo.findForDayPage(resourceId, start, end, Pageable.unpaged());
        return page.getContent().stream()
                .map(r -> {
                    // Acceder al resource dentro del stream para evitar LazyInitializationException
                    Long resId = r.getResource().getId();
                    return toResponse(r, resId);
                })
                .toList();
    }

    // ===================== Helpers =====================

    /** LocalDate del instante en UTC, para claves de caché y comparaciones de día. */
    public LocalDate dayDate(OffsetDateTime ts) {
        return ts.atZoneSameInstant(ZoneOffset.UTC).toLocalDate();
    }

    /** String "YYYY-MM-DD" en UTC (si necesitas mantener compatibilidad en otros lugares). */
    public String dayKey(OffsetDateTime ts) {
        return dayDate(ts).toString();
    }

    /** Obtiene la entidad Reservation o lanza NotFoundException. */
    public Reservation getEntity(Long id) {
        return reservationRepo.findById(id)
                .orElseThrow(() -> new NotFoundException("Reservation %d no existe".formatted(id)));
    }

    private ReservationResponse toResponse(Reservation saved, Long resourceId) {
        return new ReservationResponse(
                saved.getId(),
                resourceId,
                saved.getTableId(),
                saved.getUser() != null ? saved.getUser().getId() : null,
                saved.getCustomerName(),
                saved.getCustomerEmail(),
                saved.getPartySize(),
                saved.getStartTime(),
                saved.getEndTime(),
                saved.getStatus().name()
        );
    }
}