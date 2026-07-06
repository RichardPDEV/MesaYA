package com.example.reservas.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RateLimitFilter extends OncePerRequestFilter {

    private final Map<String, Bucket> globalBuckets = new ConcurrentHashMap<>();
    private final Map<String, Bucket> hotBuckets = new ConcurrentHashMap<>();
    private final Map<String, Bucket> authBuckets = new ConcurrentHashMap<>();

    private Bucket newGlobalBucket() {
        Bandwidth limit = Bandwidth.classic(100, Refill.greedy(100, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(limit).build();
    }

    private Bucket newHotBucket() {
        Bandwidth limit = Bandwidth.classic(20, Refill.greedy(20, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(limit).build();
    }

    private Bucket newAuthBucket() {
        Bandwidth limit = Bandwidth.classic(5, Refill.greedy(5, Duration.ofMinutes(1)));
        return Bucket.builder().addLimit(limit).build();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String ip = extractClientIp(request);
        String path = request.getRequestURI();
        String method = request.getMethod();

        boolean isHot = ("/v1/availability".equals(path) && "GET".equalsIgnoreCase(method))
                     || ("/v1/reservations".equals(path) && "POST".equalsIgnoreCase(method));
        boolean isAuth = "/auth/login".equals(path)
                || "/auth/register".equals(path)
                || "/auth/refresh".equals(path);

        // Hot bucket primero
        if (isHot) {
            String key = ip + "|HOT";
            Bucket b = hotBuckets.computeIfAbsent(key, k -> newHotBucket());
            if (!b.tryConsume(1)) {
                tooMany(response, 60);
                return;
            }
        }

        if (isAuth) {
            String key = ip + "|AUTH";
            Bucket b = authBuckets.computeIfAbsent(key, k -> newAuthBucket());
            if (!b.tryConsume(1)) {
                tooMany(response, 60);
                return;
            }
        }

        // Global bucket
        String gkey = ip + "|GLOBAL";
        Bucket gb = globalBuckets.computeIfAbsent(gkey, k -> newGlobalBucket());
        if (!gb.tryConsume(1)) {
            tooMany(response, 60);
            return;
        }

        chain.doFilter(request, response);
    }

    private String extractClientIp(HttpServletRequest request) {
        String xf = request.getHeader("X-Forwarded-For");
        if (xf != null && !xf.isBlank()) {
            return xf.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private void tooMany(HttpServletResponse response, int retryAfterSeconds) throws IOException {
        response.setStatus(429);
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
        response.setContentType("application/json");
        response.getWriter().write("{" +
                "\"status\":429,\"code\":\"RATE_LIMITED\",\"message\":\"Límite de peticiones excedido. Intenta más tarde.\"}");
    }
}
