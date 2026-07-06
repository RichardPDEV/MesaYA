package com.example.reservas.service;

import com.example.reservas.domain.Business;
import com.example.reservas.domain.Reservation;
import com.example.reservas.domain.Resource;
import com.example.reservas.domain.User;
import com.example.reservas.repo.CancellationPolicyRepository;
import com.example.reservas.repo.ReservationRepository;
import com.example.reservas.repo.ResourceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cache.CacheManager;
import org.springframework.security.access.AccessDeniedException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReservationServiceAuthorizationTest {

    @Mock
    private ReservationRepository reservationRepository;

    @Mock
    private ResourceRepository resourceRepository;

    @Mock
    private CancellationPolicyRepository cancellationPolicyRepository;

    @Mock
    private CacheManager cacheManager;

    @Mock
    private UserService userService;

    @InjectMocks
    private ReservationService reservationService;

    @Test
    void getEntityForCurrentUser_deniesAccessToAnotherUsersReservation() {
        Reservation reservation = new Reservation();
        reservation.setId(1L);

        Resource resource = new Resource();
        Business business = new Business();
        business.setOwnerId(10L);
        resource.setBusiness(business);
        reservation.setResource(resource);

        User reservationOwner = new User();
        reservationOwner.setId(2L);
        reservationOwner.setUsername("owner@example.com");
        reservation.setUser(reservationOwner);

        User currentUser = new User();
        currentUser.setId(3L);
        currentUser.setUsername("other@example.com");

        when(reservationRepository.findById(1L)).thenReturn(Optional.of(reservation));
        when(userService.findByUsername("other@example.com")).thenReturn(Optional.of(currentUser));

        assertThrows(AccessDeniedException.class, () -> reservationService.getEntityForCurrentUser(1L, "other@example.com"));
    }
}
