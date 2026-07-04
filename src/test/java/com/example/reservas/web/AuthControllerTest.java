package com.example.reservas.web;

import com.example.reservas.domain.User;
import com.example.reservas.domain.UserRole;
import com.example.reservas.security.JwtUtil;
import com.example.reservas.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    private MockMvc mockMvc;

    @Mock
    private UserService userService;

    @Mock
    private JwtUtil jwtUtil;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        mockMvc = MockMvcBuilders.standaloneSetup(new AuthController(userService, jwtUtil)).build();
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

        mockMvc.perform(get("/auth/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("ana@example.com"))
                .andExpect(jsonPath("$.displayName").value("Ana Pérez"))
                .andExpect(jsonPath("$.role").value("USER"));
    }
}
