package com.example.reservas.config;

import com.example.reservas.domain.User;
import com.example.reservas.domain.UserRole;
import com.example.reservas.security.JwtUtil;
import com.example.reservas.service.UserService;
import com.example.reservas.web.AuthController;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

@ExtendWith(MockitoExtension.class)
class RateLimitFilterTest {

    @Mock
    private UserService userService;

    @Mock
    private JwtUtil jwtUtil;

    @Test
    void loginEndpointIsRateLimitedAfterConfiguredThreshold() throws Exception {
        User user = new User();
        user.setId(7L);
        user.setUsername("ana@example.com");
        user.setDisplayName("Ana Pérez");
        user.setRole(UserRole.USER);

        when(userService.authenticate("ana@example.com", "password")).thenReturn(Optional.of(user));
        when(jwtUtil.generateAccessToken("ana@example.com", "USER")).thenReturn("access-token");
        when(jwtUtil.generateRefreshToken("ana@example.com")).thenReturn("refresh-token");

        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new AuthController(userService, jwtUtil))
                .addFilters(new RateLimitFilter())
                .build();

        for (int i = 0; i < 6; i++) {
            int status = mockMvc.perform(post("/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"username\":\"ana@example.com\",\"password\":\"password\"}"))
                    .andReturn()
                    .getResponse()
                    .getStatus();

            if (i < 5) {
                assertEquals(200, status, "The first requests should be accepted");
            } else {
                assertEquals(429, status, "The sixth request should be throttled");
            }
        }
    }
}
