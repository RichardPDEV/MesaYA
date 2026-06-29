package com.example.reservas.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;

@Component
public class JwtUtil {
    private final Key key;
    private final long accessValidityMs;
    private final long refreshValidityMs;

    public JwtUtil(
            @Value("${APP_JWT_SECRET:replace-with-a-secure-long-secret-key-please-change}") String secret,
            @Value("${APP_JWT_ACCESS_VALIDITY_MS:900000}") long accessValidityMs,
            @Value("${APP_JWT_REFRESH_VALIDITY_MS:604800000}") long refreshValidityMs) {
        if (secret == null || secret.isBlank() || secret.startsWith("replace-with") || secret.length() < 32) {
            throw new IllegalStateException("APP_JWT_SECRET must be set to a secure value (min 32 chars). Set APP_JWT_SECRET environment variable before starting in production.");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessValidityMs = accessValidityMs;
        this.refreshValidityMs = refreshValidityMs;
    }

    public String generateAccessToken(String username) {
        return generateToken(username, accessValidityMs);
    }

    public String generateRefreshToken(String username) {
        return generateToken(username, refreshValidityMs);
    }

    private String generateToken(String username, long validityMs) {
        Date now = new Date();
        return Jwts.builder()
                .setSubject(username)
                .setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + validityMs))
                .signWith(key)
                .compact();
    }

    public String extractUsername(String token) {
        return Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token).getBody().getSubject();
    }

    public boolean validate(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token);
            return true;
        } catch (JwtException | IllegalArgumentException ex) {
            return false;
        }
    }
}
