package com.example.reservas;

import com.example.reservas.domain.*;
import com.example.reservas.repo.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.DisabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.example.reservas.API_de_reservas.ApiDeReservasApplication;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@SpringBootTest(classes = ApiDeReservasApplication.class)
@EnableJpaRepositories(basePackages = "com.example.reservas.repo")
@EntityScan(basePackages = "com.example.reservas.domain")
@ComponentScan(basePackages = "com.example.reservas")
@Testcontainers
@DisabledIfEnvironmentVariable(named = "CI", matches = "true")
class ReservationRepositoryIT {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
            .withDatabaseName("reservas")
            .withUsername("reservas")
            .withPassword("reservas");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", postgres::getJdbcUrl);
        r.add("spring.datasource.username", postgres::getUsername);
        r.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired BusinessRepository businessRepo;
    @Autowired ResourceRepository resourceRepo;
    @Autowired ReservationRepository reservationRepo;

    Resource resource;

    @BeforeEach
    void setup() {
        Business b = new Business();
        b.setName("Demo"); b.setType("RESTAURANT");
        b = businessRepo.save(b);

        Resource r = new Resource();
        r.setBusiness(b); r.setName("Mesa 1"); r.setCapacity(4);
        resource = resourceRepo.save(r);
    }

    @Test
    @Transactional
    void noPermiteSolapesPorConstraint() {
        OffsetDateTime s1 = OffsetDateTime.of(2025, 1, 1, 12, 0, 0, 0, ZoneOffset.UTC);
        OffsetDateTime e1 = s1.plusHours(2);

        Reservation a = new Reservation();
        a.setResource(resource); a.setCustomerName("A"); a.setCustomerEmail("a@a.com");
        a.setPartySize(2); a.setStartTime(s1); a.setEndTime(e1);
        a.setTableId("T1");
        reservationRepo.saveAndFlush(a);

        Reservation b = new Reservation();
        b.setResource(resource); b.setCustomerName("B"); b.setCustomerEmail("b@b.com");
        b.setPartySize(2);
        b.setStartTime(s1.plusMinutes(30)); // solapa
        b.setEndTime(e1.plusMinutes(30));
        b.setTableId("T1");

        // No constraint at DB level for overlaps; validate mediante la consulta de solapes
        var overlaps = reservationRepo.findOverlaps(resource.getId(), b.getTableId(), b.getStartTime(), b.getEndTime());
        Assertions.assertFalse(overlaps.isEmpty(), "Se esperaba detectar solapes usando findOverlaps");
    }
}