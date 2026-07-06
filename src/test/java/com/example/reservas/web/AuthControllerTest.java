package com.example.reservas.web;

import com.example.reservas.domain.User;
import com.example.reservas.domain.UserRole;
import com.example.reservas.security.JwtUtil;
import com.example.reservas.service.UserService;
import jakarta.servlet.http.Cookie;
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

import java.lang.reflect.Field;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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

    @Test
    void logoutClearsRefreshCookie() throws Exception {
        when(jwtUtil.validate("refresh-token")).thenReturn(true);
        when(jwtUtil.extractUsername("refresh-token")).thenReturn("ana@example.com");
        User user = new User();
        user.setId(7L);
        user.setUsername("ana@example.com");
        when(userService.findByUsername("ana@example.com")).thenReturn(Optional.of(user));

        mockMvc.perform(post("/auth/logout").cookie(new Cookie("refreshToken", "refresh-token")))
                .andExpect(status().isOk())
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("refreshToken="))))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("Max-Age=0"))))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("SameSite=None"))))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("HttpOnly"))));
    }

    @Test
    void refreshUpdatesCookieAndReturnsToken() throws Exception {
        when(jwtUtil.validate("refresh-token")).thenReturn(true);
        when(jwtUtil.extractUsername("refresh-token")).thenReturn("ana@example.com");
        User user = new User();
        user.setId(7L);
        user.setUsername("ana@example.com");
        user.setDisplayName("Ana Pérez");
        user.setRole(UserRole.USER);
        user.setRefreshToken("refresh-token");
        when(userService.findByUsername("ana@example.com")).thenReturn(Optional.of(user));
        when(jwtUtil.generateAccessToken("ana@example.com", "USER")).thenReturn("new-access-token");
        when(jwtUtil.generateRefreshToken("ana@example.com")).thenReturn("new-refresh-token");

        mockMvc.perform(post("/auth/refresh").cookie(new Cookie("refreshToken", "refresh-token")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("new-access-token"))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("refreshToken=new-refresh-token"))))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("SameSite=None"))))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("HttpOnly"))));
    }

    @Test
    void loginSetsRefreshCookieAndReturnsUser() throws Exception {
        User user = new User();
        user.setId(7L);
        user.setUsername("ana@example.com");
        user.setDisplayName("Ana Pérez");
        user.setRole(UserRole.USER);

        when(userService.authenticate("ana@example.com", "password")).thenReturn(Optional.of(user));
        when(jwtUtil.generateAccessToken("ana@example.com", "USER")).thenReturn("access-token");
        when(jwtUtil.generateRefreshToken("ana@example.com")).thenReturn("refresh-token");

        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"ana@example.com\",\"password\":\"password\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("access-token"))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("refreshToken=refresh-token"))))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("SameSite=None"))))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("HttpOnly"))));
    }

    @Test
    void loginMarksCookieSecureWhenSameSiteIsNone() throws Exception {
        AuthController controller = new AuthController(userService, jwtUtil);
        setField(controller, "cookieSameSite", "None");
        setField(controller, "cookieSecure", false);

        User user = new User();
        user.setId(7L);
        user.setUsername("ana@example.com");
        user.setDisplayName("Ana Pérez");
        user.setRole(UserRole.USER);

        when(userService.authenticate("ana@example.com", "password")).thenReturn(Optional.of(user));
        when(jwtUtil.generateAccessToken("ana@example.com", "USER")).thenReturn("access-token");
        when(jwtUtil.generateRefreshToken("ana@example.com")).thenReturn("refresh-token");

        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("{\"username\":\"ana@example.com\",\"password\":\"password\"}"))
                .andExpect(status().isOk())
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.containsString("; Secure"))));
    }

    private void setField(Object target, String name, Object value) throws Exception {
        Field field = AuthController.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
