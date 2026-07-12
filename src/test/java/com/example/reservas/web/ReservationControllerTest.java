package com.example.reservas.web;

import com.example.reservas.dto.ReservationResponse;
import com.example.reservas.service.ReservationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ReservationControllerTest {

    @Mock
    private ReservationService reservationService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ReservationController(reservationService)).build();
    }

    @Test
    void rescheduleEndpointUpdatesReservation() throws Exception {
        ReservationResponse response = new ReservationResponse(
                42L,
                7L,
                "T2",
                1L,
                "Ana",
                "ana@example.com",
                2,
                OffsetDateTime.parse("2026-07-11T20:00:00Z"),
                OffsetDateTime.parse("2026-07-11T22:00:00Z"),
                "CONFIRMED",
                "Restaurante Demo",
                "T2",
                null,
                OffsetDateTime.parse("2026-07-10T19:00:00Z")
        );

        when(reservationService.reschedule(eq(42L), any(), any(OffsetDateTime.class), any())).thenReturn(response);

        mockMvc.perform(patch("/v1/reservations/42/reschedule")
                        .contentType("application/json")
                        .content("{\"resourceId\":7,\"tableId\":\"T2\",\"startTime\":\"2026-07-11T20:00:00Z\",\"endTime\":\"2026-07-11T22:00:00Z\",\"reason\":\"Reprogramada por el cliente\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(42));

        verify(reservationService).reschedule(eq(42L), any(), any(OffsetDateTime.class), any());
    }
}
