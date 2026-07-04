package com.example.reservas.web;

import com.example.reservas.domain.User;
import com.example.reservas.security.JwtUtil;
import com.example.reservas.service.UserService;
import com.example.reservas.web.dto.AuthRequests;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
public class AuthController {
    private final UserService userService;
    private final JwtUtil jwtUtil;

    @Value("${APP_COOKIE_SECURE:false}")
    private boolean cookieSecure;

    @Value("${APP_COOKIE_SAMESITE:Lax}")
    private String cookieSameSite;

    public AuthController(UserService userService, JwtUtil jwtUtil) { this.userService = userService; this.jwtUtil = jwtUtil; }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody AuthRequests.Register req) {
        String username = req.username() == null ? "" : req.username().trim();
        String password = req.password() == null ? "" : req.password();
        String displayName = req.displayName() == null ? "" : req.displayName().trim();
        if (username.isBlank() || password.isBlank() || displayName.isBlank()) {
            return ResponseEntity.badRequest().body(java.util.Map.of("error", "campos_requeridos"));
        }

        var u = userService.register(username, password, displayName);
        return ResponseEntity.ok().body(java.util.Map.of(
                "id", u.getId(),
                "username", u.getUsername(),
                "displayName", u.getDisplayName(),
                "role", u.getRole().name()
        ));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AuthRequests.Login req) {
        String username = req.username() == null ? "" : req.username().trim();
        String password = req.password() == null ? "" : req.password();
        if (username.isBlank() || password.isBlank()) {
            return ResponseEntity.badRequest().body(java.util.Map.of("error", "campos_requeridos"));
        }

        var userOpt = userService.authenticate(username, password);
        if (userOpt.isEmpty()) return ResponseEntity.status(401).body(java.util.Map.of("error", "invalid_credentials"));
        var user = userOpt.get();
        var access = jwtUtil.generateAccessToken(user.getUsername(), user.getRole().name());
        var refresh = jwtUtil.generateRefreshToken(user.getUsername());
        userService.saveRefreshToken(user.getId(), refresh);
        Cookie cookie = new Cookie("refreshToken", refresh);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(60 * 60 * 24 * 7);
        cookie.setSecure(cookieSecure);
        var resp = ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookieToHeader(cookie)).body(java.util.Map.of(
                "token", access,
                "id", user.getId(),
                "username", user.getUsername(),
                "displayName", user.getDisplayName(),
                "role", user.getRole().name()
        ));
        return resp;
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return ResponseEntity.status(401).body(java.util.Map.of("error","no_refresh"));
        String refresh = null;
        for (var c : cookies) if ("refreshToken".equals(c.getName())) refresh = c.getValue();
        if (refresh == null) return ResponseEntity.status(401).body(java.util.Map.of("error","no_refresh"));
        if (!jwtUtil.validate(refresh)) return ResponseEntity.status(401).body(java.util.Map.of("error","invalid_refresh"));
        String username = jwtUtil.extractUsername(refresh);
        var userOpt = userService.findByUsername(username);
        if (userOpt.isEmpty()) return ResponseEntity.status(401).body(java.util.Map.of("error","invalid_refresh"));
        var user = userOpt.get();
        if (user.getRefreshToken() == null || !user.getRefreshToken().equals(refresh)) return ResponseEntity.status(401).body(java.util.Map.of("error","invalid_refresh"));
        var newAccess = jwtUtil.generateAccessToken(username, user.getRole().name());
        var newRefresh = jwtUtil.generateRefreshToken(username);
        userService.saveRefreshToken(user.getId(), newRefresh);
        Cookie cookie = new Cookie("refreshToken", newRefresh);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(60 * 60 * 24 * 7);
        cookie.setSecure(cookieSecure);
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookieToHeader(cookie)).body(java.util.Map.of("token", newAccess));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication.getName() == null) {
            return ResponseEntity.status(401).body(java.util.Map.of("error", "unauthorized"));
        }

        var userOpt = userService.findByUsername(authentication.getName());
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(401).body(java.util.Map.of("error", "unauthorized"));
        }

        User user = userOpt.get();
        return ResponseEntity.ok(java.util.Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "displayName", user.getDisplayName(),
                "role", user.getRole().name()
        ));
    }

    private String cookieToHeader(Cookie cookie) {
        StringBuilder sb = new StringBuilder();
        sb.append(cookie.getName()).append("=").append(cookie.getValue());
        sb.append("; Path=").append(cookie.getPath());
        if (cookie.getMaxAge() > 0) sb.append("; Max-Age=").append(cookie.getMaxAge());
        if (cookie.getSecure()) sb.append("; Secure");
        sb.append("; SameSite=").append(cookieSameSite);
        sb.append("; HttpOnly");
        return sb.toString();
    }
}
