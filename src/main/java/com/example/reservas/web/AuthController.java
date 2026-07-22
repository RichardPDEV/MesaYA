package com.example.reservas.web;

import com.example.reservas.domain.User;
import com.example.reservas.security.JwtUtil;
import com.example.reservas.service.UserService;
import com.example.reservas.web.dto.AuthRequests;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
public class AuthController {
    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserService userService;
    private final JwtUtil jwtUtil;

    @Value("${APP_COOKIE_SECURE:false}")
    private boolean cookieSecure = false;

    @Value("${APP_COOKIE_SAMESITE:None}")
    private String cookieSameSite = "None";

    @Value("${APP_COOKIE_DOMAIN:}")
    private String cookieDomain = "";

    @Value("${app.auth.debug-confirmation-code:false}")
    private boolean debugConfirmationCode = false;

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
        var body = new java.util.LinkedHashMap<String, Object>();
        body.put("id", u.getId());
        body.put("username", u.getUsername());
        body.put("displayName", u.getDisplayName());
        body.put("role", u.getRole().name());
        body.put("requiresEmailConfirmation", true);
        if (debugConfirmationCode && u.getConfirmationCode() != null) {
            body.put("confirmationCode", u.getConfirmationCode());
        }
        return ResponseEntity.ok().body(body);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(HttpServletRequest request, @RequestBody AuthRequests.Login req) {
        String username = req.username() == null ? "" : req.username().trim();
        String password = req.password() == null ? "" : req.password();
        if (username.isBlank() || password.isBlank()) {
            return ResponseEntity.badRequest().body(java.util.Map.of("error", "campos_requeridos"));
        }

        var userOpt = userService.authenticate(username, password);
        if (userOpt.isEmpty()) {
            log.warn("Login failed for username={} from ip={}", username, extractClientIp(request));
            return ResponseEntity.status(401).body(java.util.Map.of("error", "invalid_credentials"));
        }
        var user = userOpt.get();
        var access = jwtUtil.generateAccessToken(user.getUsername(), user.getRole().name());
        var refresh = jwtUtil.generateRefreshToken(user.getUsername());
        userService.saveRefreshToken(user.getId(), refresh);
        Cookie cookie = new Cookie("refreshToken", refresh);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(60 * 60 * 24 * 7);
        cookie.setSecure(isCookieSecure());
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            cookie.setDomain(cookieDomain);
        }
        var resp = ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookieToHeader(cookie)).body(java.util.Map.of(
                "token", access,
                "id", user.getId(),
                "username", user.getUsername(),
                "displayName", user.getDisplayName(),
                "role", user.getRole().name()
        ));
        return resp;
    }

    @PostMapping("/confirm")
    public ResponseEntity<?> confirm(@RequestBody AuthRequests.Confirm req) {
        String username = req.username() == null ? "" : req.username().trim().toLowerCase();
        String code = req.code() == null ? "" : req.code().trim();
        if (username.isBlank() || code.isBlank()) return ResponseEntity.badRequest().body(java.util.Map.of("error","campos_requeridos"));
        boolean ok = userService.confirmEmail(username, code);
        if (!ok) return ResponseEntity.badRequest().body(java.util.Map.of("error","invalid_code_or_expired"));
        return ResponseEntity.ok().body(java.util.Map.of("status","confirmed"));
    }

    @PostMapping("/resend")
    public ResponseEntity<?> resend(@RequestBody AuthRequests.Resend req) {
        String username = req.username() == null ? "" : req.username().trim().toLowerCase();
        if (username.isBlank()) return ResponseEntity.badRequest().body(java.util.Map.of("error","campos_requeridos"));
        boolean ok = userService.resendConfirmationCode(username);
        if (!ok) return ResponseEntity.badRequest().body(java.util.Map.of("error","user_not_found"));
        return ResponseEntity.ok().body(java.util.Map.of("status","sent"));
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            log.warn("Refresh failed: no cookies from ip={}", extractClientIp(request));
            return ResponseEntity.status(401).body(java.util.Map.of("error","no_refresh"));
        }
        String refresh = null;
        for (var c : cookies) if ("refreshToken".equals(c.getName())) refresh = c.getValue();
        if (refresh == null) {
            log.warn("Refresh failed: missing refresh cookie from ip={}", extractClientIp(request));
            return ResponseEntity.status(401).body(java.util.Map.of("error","no_refresh"));
        }
        if (!jwtUtil.validate(refresh)) {
            log.warn("Refresh failed: invalid token from ip={}", extractClientIp(request));
            return ResponseEntity.status(401).body(java.util.Map.of("error","invalid_refresh"));
        }
        String username = jwtUtil.extractUsername(refresh);
        var userOpt = userService.findByUsername(username);
        if (userOpt.isEmpty()) {
            log.warn("Refresh failed: user not found for username={} from ip={}", username, extractClientIp(request));
            return ResponseEntity.status(401).body(java.util.Map.of("error","invalid_refresh"));
        }
        var user = userOpt.get();
        if (user.getRefreshToken() == null || !user.getRefreshToken().equals(refresh)) {
            log.warn("Refresh failed: token mismatch for username={} from ip={}", username, extractClientIp(request));
            return ResponseEntity.status(401).body(java.util.Map.of("error","invalid_refresh"));
        }
        var newAccess = jwtUtil.generateAccessToken(username, user.getRole().name());
        var newRefresh = jwtUtil.generateRefreshToken(username);
        userService.saveRefreshToken(user.getId(), newRefresh);
        Cookie cookie = new Cookie("refreshToken", newRefresh);
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge(60 * 60 * 24 * 7);
        cookie.setSecure(isCookieSecure());
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            cookie.setDomain(cookieDomain);
        }
        log.info("Refresh succeeded for username={} from ip={}", username, extractClientIp(request));
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

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            String refresh = null;
            for (var c : cookies) {
                if ("refreshToken".equals(c.getName())) {
                    refresh = c.getValue();
                    break;
                }
            }
            if (refresh != null && jwtUtil.validate(refresh)) {
                String username = jwtUtil.extractUsername(refresh);
                userService.findByUsername(username).ifPresent(user -> userService.saveRefreshToken(user.getId(), null));
            }
        }
        Cookie clearCookie = new Cookie("refreshToken", "");
        clearCookie.setHttpOnly(true);
        clearCookie.setPath("/");
        clearCookie.setMaxAge(0);
        clearCookie.setSecure(isCookieSecure());
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            clearCookie.setDomain(cookieDomain);
        }
        log.info("Logout completed for request from ip={}", extractClientIp(request));
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookieToHeader(clearCookie)).build();
    }

    private String extractClientIp(HttpServletRequest request) {
        String xf = request.getHeader("X-Forwarded-For");
        if (xf != null && !xf.isBlank()) {
            return xf.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private boolean isCookieSecure() {
        return cookieSecure || "None".equalsIgnoreCase(cookieSameSite);
    }

    private String cookieToHeader(Cookie cookie) {
        StringBuilder sb = new StringBuilder();
        sb.append(cookie.getName()).append("=").append(cookie.getValue());
        sb.append("; Path=").append(cookie.getPath());
        if (cookie.getMaxAge() >= 0) sb.append("; Max-Age=").append(cookie.getMaxAge());
        if (cookie.getSecure()) sb.append("; Secure");
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            sb.append("; Domain=").append(cookieDomain);
        }
        sb.append("; SameSite=").append(cookieSameSite);
        sb.append("; HttpOnly");
        return sb.toString();
    }
}
