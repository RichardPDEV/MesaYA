package com.example.reservas.security;

import com.example.reservas.API_de_reservas.ApiDeReservasApplication;
import com.example.reservas.controller.ResourceQueryController;
import com.example.reservas.mapper.AvailabilityMapper;
import com.example.reservas.service.AvailabilityService;
import com.example.reservas.service.ReservationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = ApiDeReservasApplication.class)
@AutoConfigureMockMvc(addFilters = true)
class ResourceQuerySecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ReservationService reservationService;

    @MockBean
    private AvailabilityService availabilityService;

    @MockBean
    private AvailabilityMapper availabilityMapper;

    @MockBean
    private JwtUtil jwtUtil;

    @Test
    void resourceQueriesRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/resources/1/reservations").param("date", "2026-07-05"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void authenticatedResourceQueriesAreAllowed() throws Exception {
        when(jwtUtil.validate("valid-token")).thenReturn(true);
        when(jwtUtil.extractUsername("valid-token")).thenReturn("ana@example.com");
        when(jwtUtil.extractRole("valid-token")).thenReturn("USER");
        when(reservationService.listForDay(eq(1L), any())).thenReturn(List.of());

        mockMvc.perform(get("/api/resources/1/reservations").param("date", "2026-07-05")
                        .header("Authorization", "Bearer valid-token"))
                .andExpect(status().isOk());
    }

    @Test
    void reservationDetailsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/v1/reservations/1"))
                .andExpect(status().isUnauthorized());
    }
}
