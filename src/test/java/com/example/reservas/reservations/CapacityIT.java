package com.example.reservas.reservations;

import com.example.reservas.domain.Resource;
import com.example.reservas.domain.Reservation;
import com.example.reservas.service.ValidationException;
import com.example.reservas.dto.CreateReservationRequest;
import com.example.reservas.repo.CancellationPolicyRepository;
import com.example.reservas.repo.ReservationRepository;
import com.example.reservas.repo.ResourceRepository;
import com.example.reservas.service.ReservationService;
import com.example.reservas.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CapacityIT {

  @Mock
  ReservationRepository reservationRepo;

  @Mock
  ResourceRepository resourceRepo;

  @Mock
  CancellationPolicyRepository cancellationPolicyRepo;

  @Mock
  CacheManager cacheManager;

  @Mock
  UserService userService;

  @InjectMocks
  ReservationService reservationService;

  Resource resource;

  @BeforeEach
  void setup() {
    resource = new Resource();
    resource.setId(1L);
    resource.setName("Mesa 1");
    resource.setCapacity(4);

    lenient().when(resourceRepo.findById(resource.getId())).thenReturn(Optional.of(resource));
    lenient().when(reservationRepo.findOverlaps(eq(resource.getId()), anyString(), any(), any())).thenReturn(Collections.emptyList());
    lenient().when(reservationRepo.saveAndFlush(any(Reservation.class))).thenAnswer(invocation -> invocation.getArgument(0));
  }

  @Test
  void create_allowsEqualToCapacity() {
    var start = OffsetDateTime.now(ZoneOffset.UTC).plusDays(1);
    var req = new CreateReservationRequest(
        resource.getId(),
        "Juan",
        "juan@example.com",
        4,
        "T1",
        start,
        start.plusHours(2)
    );
    assertDoesNotThrow(() -> reservationService.create(req));
  }

  @Test
  void create_rejectsOverCapacity() {
    var start = OffsetDateTime.now(ZoneOffset.UTC).plusDays(1);
    var req = new CreateReservationRequest(
        resource.getId(),
        "Richard",
        "richard@example.com",
        5,
        "T1",
        start,
        start.plusHours(2)
    );
    assertThrows(ValidationException.class, () -> reservationService.create(req));
  }
}