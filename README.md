# API de Reservas

[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://adoptium.net/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.x-brightgreen.svg)](https://spring.io/projects/spring-boot)
[![Maven](https://img.shields.io/badge/Build-Maven-blue.svg)](https://maven.apache.org/)
[![Cache](https://img.shields.io/badge/Cache-InMemory-blue.svg)](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#cache)
[![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL-336791.svg)](https://www.postgresql.org/)
[![Testcontainers](https://img.shields.io/badge/Testcontainers-Ready-0db7ed.svg)](https://www.testcontainers.org/)

API REST para gestionar reservas con reglas de negocio (capacidad, solapes, cancelación FREE/LATE), disponibilidad diaria cacheada en memoria, y migraciones con Flyway. Incluye CI con GitHub Actions.

- Cálculo de día y claves de caché normalizadas en UTC.
- Separación clara entre Core (Richard) y API (Juan).

---

## Contenido
- [Características](#características)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Inicio rápido](#inicio-rápido)
- [Configuración](#configuración)
- [Ejecución](#ejecución)
- [Docker / Docker Compose](#docker--docker-compose)
- [Tests](#tests)
- [CI (GitHub Actions)](#ci-github-actions)
- [API (endpoints básicos)](#api-endpoints-básicos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Solución de problemas](#solución-de-problemas)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Características
- Disponibilidad por recurso y día con caché en memoria (`availability`).
- Invalidación automática de caché al crear o cancelar reservas.
- Reglas de negocio: capacidad, detección de solapes, cancelación FREE vs LATE según política.
- DTOs y controladores REST aislando la lógica de negocio.
- Migraciones con Flyway y pruebas de integración con Testcontainers.

---

## Stack
- Java 21, Spring Boot 3.x, Spring Data JPA, Spring Cache (simple)
- PostgreSQL
- Flyway para migraciones
- JUnit 5, Testcontainers
- Maven

---

## Requisitos
- JDK 21+
- Maven 3.9+
- Docker (recomendado para Postgres y Testcontainers)
- PostgreSQL 16.x

---

## Inicio rápido

1) Levanta dependencias (opcional con Docker Compose):
```bash
docker compose up -d
```

2) Ejecuta la aplicación:
```bash
./mvnw spring-boot:run
```

3) Ejecuta tests:
```bash
./mvnw test
```

4) Empaqueta el artefacto:
```bash
./mvnw -DskipTests=true package
```

---

## Configuración

Archivo base `src/main/resources/application.yml` (ejemplo):
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/reservas
    username: reservas
    password: reservas

  jpa:
    hibernate:
      ddl-auto: validate      # o update en desarrollo
    properties:
      hibernate.jdbc.time_zone: UTC

  flyway:
    enabled: true

  cache:
    type: simple

server:
  port: 8080
```

Habilitar caché:
```java
@SpringBootApplication
@EnableCaching
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
```

Variables de entorno habituales:
- `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`
- `SPRING_FLYWAY_ENABLED=true`
- `MAIL_HOST=smtp.resend.com`
- `MAIL_PORT=587`
- `MAIL_USERNAME=apikey`
- `MAIL_PASSWORD=tu-resend-api-key`
- `MAIL_SMTP_AUTH=true`
- `MAIL_SMTP_STARTTLS=true`
- `MAIL_FROM=reservas@tu-dominio.com`

---

## Ejecución

- Desarrollo local:
  ```bash
  ./mvnw spring-boot:run
  ```
- Perfil específico:
  ```bash
  SPRING_PROFILES_ACTIVE=local ./mvnw spring-boot:run
  ```

---

## Docker / Docker Compose

Comandos principales:
```bash
# Build + up
docker compose up --build -d

# Ver estado
docker compose ps

# Detener
docker compose down

# Detener y borrar volúmenes
docker compose down -v
```

Variables típicas en `docker-compose.yml`:
- `SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/reservas`
- `SPRING_DATASOURCE_USERNAME=reservas`
- `SPRING_DATASOURCE_PASSWORD=reservas`

---

## Tests

- Ejecutar todas las pruebas:
  ```bash
  ./mvnw test
  ```
- Ejecutar un test concreto:
  ```bash
  ./mvnw -Dtest=ApiSmokeTest test
  ```

Notas:
- Algunos tests usan Testcontainers (requiere Docker activo).
- Para pruebas livianas puedes usar H2 y/o `spring.cache.type=simple` en un perfil de test.

---

## CI (GitHub Actions)

Workflow: `.github/workflows/ci.yml`
- Se ejecuta en `push` y `pull_request`.
- Java Temurin 21.
- Cache de Maven.
- Paso principal:
  ```bash
  mvn -B -q verify
  ```
Opcionales: publicar artefactos del build, reportes JUnit o cobertura (se pueden añadir pasos con `actions/upload-artifact`).

---

## API (endpoints básicos)

Base URL: `http://localhost:8080`

- POST `/api/reservations`
  - Crea una reserva, valida capacidad/solapes y limpia caché de días afectados.
  - Ejemplo:
    ```bash
    curl -X POST http://localhost:8080/api/reservations \
      -H "Content-Type: application/json" \
      -d '{
        "resourceId": 1,
        "customerName": "Ana",
        "customerEmail": "ana@example.com",
        "partySize": 4,
        "startTime": "2025-01-01T18:00:00Z",
        "endTime": "2025-01-01T20:00:00Z"
      }'
    ```

- POST `/api/reservations/{id}/cancel`
  - Cancela (FREE → CANCELLED, LATE → LATE_CANCELLED) e invalida caché.
    ```bash
    curl -X POST http://localhost:8080/api/reservations/123/cancel \
      -H "Content-Type: application/json" \
      -d '{ "reason": "Cambio de planes" }'
    ```

- GET `/api/resources/{resourceId}/reservations?date=YYYY-MM-DD`
  - Lista reservas del día (UTC).

- GET `/api/resources/{resourceId}/availability?date=YYYY-MM-DD`
  - Ventanas libres cacheadas para el día (UTC).

Prueba con swagger: http://localhost:8080/swagger-ui.html.


## Solución de problemas

- La aplicación no usa Redis actualmente. Si algo requiere caché persistente en un futuro, puedes habilitar Redis con `spring.cache.type=redis`.

- Diferencias horarias:
  - Tiempos en ISO-8601 con zona (`Z`/offset).
  - Día y claves de caché normalizados a UTC.

- Testcontainers lento en primer uso:
  - Descarga de imágenes; las siguientes ejecuciones serán más rápidas.

---

## Contribuir
- Crea una rama `feat/mi-cambio`, ejecuta `./mvnw clean verify` y abre PR.
- Estilo de commits sugerido: Conventional Commits.

---
