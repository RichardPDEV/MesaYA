package com.example.reservas.web;

import com.example.reservas.domain.Reservation;
import com.example.reservas.dto.CreateReservationRequest;
import com.example.reservas.dto.ReservationResponse;
import com.example.reservas.service.ReservationService;
import com.example.reservas.dto.CancelReservationRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.*;
import java.util.List;
 

@RestController
@RequestMapping("/v1/reservations")
@Tag(name = "Reservations", description = "Gestión de reservas")
public class ReservationController {
    private final ReservationService reservationService;

    public ReservationController(ReservationService reservationService) { this.reservationService = reservationService; }

    @PostMapping
    @Operation(summary = "Crear reserva")
    public ReservationResponse create(@Valid @RequestBody CreateReservationRequest req, Authentication authentication) {
        return reservationService.create(req, authentication != null ? authentication.getName() : null);
    }

    @GetMapping("/mine")
    @Operation(summary = "Listar reservas del usuario autenticado")
    public List<ReservationResponse> myReservations(Authentication authentication) {
        return reservationService.listByUser(authentication != null ? authentication.getName() : null);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener reserva por id")
    public ReservationResponse get(@PathVariable Long id) {
        Reservation r = reservationService.getEntity(id);
        return new ReservationResponse(
            r.getId(), r.getResource().getId(), r.getTableId(), r.getUser() != null ? r.getUser().getId() : null, r.getCustomerName(), r.getCustomerEmail(),
            r.getPartySize(), r.getStartTime(), r.getEndTime(), r.getStatus().name()
        );
    }

    @GetMapping
    @Operation(summary = "Listar reservas por recurso y fecha (paginado)")
    public Page<ReservationResponse> list(
            @RequestParam Long resourceId,
            @RequestParam String date,
            Pageable pageable
    ) {
        LocalDate day = LocalDate.parse(date);
        OffsetDateTime start = day.atStartOfDay(ZoneOffset.UTC).toOffsetDateTime();
        OffsetDateTime end = start.plusDays(1);

        var page = reservationService // usa el repositorio paginado
            .listPage(resourceId, start, end, pageable);

        return new PageImpl<>(
            page.getContent().stream().map(r -> new ReservationResponse(
                r.getId(), r.getResource().getId(), r.getTableId(), r.getUser() != null ? r.getUser().getId() : null, r.getCustomerName(), r.getCustomerEmail(),
                r.getPartySize(), r.getStartTime(), r.getEndTime(), r.getStatus().name()
            )).toList(),
            page.getPageable(), page.getTotalElements()
        );
    }

    @PatchMapping("/{id}/cancel")
    @Operation(summary = "Cancelar reserva (aplica política)")
    public ReservationResponse cancel(@PathVariable Long id, @Valid @RequestBody CancelReservationRequest req) {
        // Coordinación con Dev A: implementar este método en ReservationService (ver bloque 9)
        var resp = reservationService.cancel(id, req.reason(), OffsetDateTime.now(ZoneOffset.UTC));
        return resp;
    }
}
