package com.example.reservas.security;

import com.example.reservas.domain.Business;
import com.example.reservas.domain.User;
import com.example.reservas.repo.BusinessRepository;
import com.example.reservas.repo.UserRepository;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.Signature;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.security.Principal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class BusinessOwnershipIntegrationTest {

    private BusinessRepository businessRepo;
    private UserRepository userRepo;
    private RequireBusinessOwnerAspect aspect;

    static class DummyController {
        @com.example.reservas.security.RequireBusinessOwner(pathVariable = "id")
        public void update(@org.springframework.web.bind.annotation.PathVariable("id") Long id, Principal principal) {}
    }

    @BeforeEach
    void setup() {
        businessRepo = mock(BusinessRepository.class);
        userRepo = mock(UserRepository.class);
        aspect = new RequireBusinessOwnerAspect(businessRepo, userRepo);
    }

    @Test
    void allows_owner() throws Throwable {
        long bizId = 1L;
        Business b = new Business();
        b.setId(bizId);
        b.setOwnerId(1L);
        when(businessRepo.findById(bizId)).thenReturn(Optional.of(b));

        User u = new User();
        u.setId(1L);
        u.setUsername("alice");
        when(userRepo.findByUsername("alice")).thenReturn(Optional.of(u));

        Method m = DummyController.class.getMethod("update", Long.class, Principal.class);
        MethodSignature sig = mock(MethodSignature.class);
        when(sig.getMethod()).thenReturn(m);
        when(sig.getParameterNames()).thenReturn(new String[]{"id","principal"});

        JoinPoint jp = mock(JoinPoint.class);
        when(jp.getSignature()).thenReturn((Signature) sig);
        Principal p = () -> "alice";
        when(jp.getArgs()).thenReturn(new Object[]{bizId, p});

        aspect.checkOwnership(jp);
    }

    @Test
    void denies_non_owner() throws Throwable {
        long bizId = 1L;
        Business b = new Business();
        b.setId(bizId);
        b.setOwnerId(1L);
        when(businessRepo.findById(bizId)).thenReturn(Optional.of(b));

        User u = new User();
        u.setId(2L);
        u.setUsername("bob");
        when(userRepo.findByUsername("bob")).thenReturn(Optional.of(u));

        Method m = DummyController.class.getMethod("update", Long.class, Principal.class);
        MethodSignature sig = mock(MethodSignature.class);
        when(sig.getMethod()).thenReturn(m);
        when(sig.getParameterNames()).thenReturn(new String[]{"id","principal"});

        JoinPoint jp = mock(JoinPoint.class);
        when(jp.getSignature()).thenReturn((Signature) sig);
        Principal p = () -> "bob";
        when(jp.getArgs()).thenReturn(new Object[]{bizId, p});

        assertThrows(org.springframework.security.access.AccessDeniedException.class, () -> aspect.checkOwnership(jp));
    }
}
