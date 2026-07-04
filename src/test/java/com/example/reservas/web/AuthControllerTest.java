package com.example.reservas.web;

import com.example.reservas.API_de_reservas.ApiDeReservasApplication;
import com.example.reservas.domain.User;
import com.example.reservas.domain.UserRole;
import com.example.reservas.security.JwtUtil;
import com.example.reservas.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
@ContextConfiguration(classes = ApiDeReservasApplication.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @MockBean
    private JwtUtil jwtUtil;

    @BeforeEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void meReturnsDisplayNameForAuthenticatedUser() throws Exception {
        User user = new User();
        user.setId(7L);
        user.setUsername("ana@example.com");
        user.setDisplayName("Ana Pérez");
        user.setRole(UserRole.USER);

        when(userService.findByUsername("ana@example.com")).thenReturn(Optional.of(user));

        UserDetails principal = org.springframework.security.core.userdetails.User.withUsername("ana@example.com")
                .password("")
                .authorities(List.of())
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities())
        );

        mockMvc.perform(get("/auth/me").header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("ana@example.com"))
                .andExpect(jsonPath("$.displayName").value("Ana Pérez"))
                .andExpect(jsonPath("$.role").value("USER"));
    }
}
