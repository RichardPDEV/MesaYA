package com.example.reservas.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class ProdStartupValidator {

    private final Environment env;
    private final String dbUrl;
    private final String dbUser;
    private final String dbPassword;
    private final String redisHost;
    private final String jwtSecret;

    public ProdStartupValidator(Environment env,
                                @Value("${DB_URL:}") String dbUrl,
                                @Value("${DB_USERNAME:}") String dbUser,
                                @Value("${DB_PASSWORD:}") String dbPassword,
                                @Value("${REDIS_HOST:}") String redisHost,
                                @Value("${APP_JWT_SECRET:}") String jwtSecret) {
        this.env = env;
        this.dbUrl = dbUrl;
        this.dbUser = dbUser;
        this.dbPassword = dbPassword;
        this.redisHost = redisHost;
        this.jwtSecret = jwtSecret;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void validateProdSecrets() {
        if (!isProdProfile()) {
            return;
        }

        if (isBlank(dbUrl) || isBlank(dbUser) || isBlank(dbPassword) || isBlank(redisHost) || isBlank(jwtSecret)) {
            throw new IllegalStateException("Producción requiere todas las variables: DB_URL, DB_USERNAME, DB_PASSWORD, REDIS_HOST, APP_JWT_SECRET");
        }
        if (dbPassword.equals("changeme") || dbPassword.equals("reservas")) {
            throw new IllegalStateException("DB_PASSWORD no puede usar valores por defecto inseguros en producción");
        }
        if (jwtSecret.length() < 32 || jwtSecret.startsWith("replace-with")) {
            throw new IllegalStateException("APP_JWT_SECRET debe ser una cadena segura de al menos 32 caracteres en producción");
        }
    }

    private boolean isProdProfile() {
        for (String p : env.getActiveProfiles()) {
            if (p.equalsIgnoreCase("prod")) return true;
        }
        return false;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
