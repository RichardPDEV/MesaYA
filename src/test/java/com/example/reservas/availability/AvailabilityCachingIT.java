package com.example.reservas.availability;

import com.example.reservas.repo.ReservationRepository;
import com.example.reservas.service.AvailabilityService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import java.time.LocalDate;
import java.util.Collections;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(SpringExtension.class)
@SpringBootTest
class AvailabilityCachingIT {

  @Autowired AvailabilityService availabilityService;

  @MockBean ReservationRepository reservationRepo;

  @Test
  void cachesAvailabilityByDay() {
    Long resourceId = 1L;
    LocalDate date = LocalDate.parse("2025-01-01");

    when(reservationRepo.findForDay(anyLong(), any(), any()))
        .thenReturn(Collections.emptyList());

    // Primera llamada: ejecuta repositorio
    availabilityService.freeWindows(resourceId, date);
    // Segunda llamada: debe venir del caché
    availabilityService.freeWindows(resourceId, date);

    verify(reservationRepo, times(1)).findForDay(eq(resourceId), any(), any());
  }
}