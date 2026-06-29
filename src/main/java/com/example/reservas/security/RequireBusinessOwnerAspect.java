package com.example.reservas.security;

import com.example.reservas.domain.Business;
import com.example.reservas.repo.BusinessRepository;
import com.example.reservas.repo.UserRepository;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.MDC;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.PathVariable;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.Optional;

@Aspect
@Component
public class RequireBusinessOwnerAspect {

    private final BusinessRepository businessRepo;
    private final UserRepository userRepo;

    public RequireBusinessOwnerAspect(BusinessRepository businessRepo, UserRepository userRepo) {
        this.businessRepo = businessRepo;
        this.userRepo = userRepo;
    }

    @Before("@annotation(com.example.reservas.security.RequireBusinessOwner) || @within(com.example.reservas.security.RequireBusinessOwner)")
    public void checkOwnership(JoinPoint jp) {
        MethodSignature sig = (MethodSignature) jp.getSignature();
        Method method = sig.getMethod();
        RequireBusinessOwner ann = method.getAnnotation(RequireBusinessOwner.class);
        if (ann == null) {
            ann = method.getDeclaringClass().getAnnotation(RequireBusinessOwner.class);
        }
        String varName = ann != null ? ann.pathVariable() : "businessId";

        Object[] args = jp.getArgs();
        Annotation[][] paramAnns = method.getParameterAnnotations();

        Long businessId = null;
        for (int i = 0; i < paramAnns.length; i++) {
            for (Annotation a : paramAnns[i]) {
                if (a instanceof PathVariable pv) {
                    String name = pv.value();
                    if (name == null || name.isBlank()) name = pv.name();
                    if (name == null || name.isBlank()) continue;
                    if (name.equals(varName) && args[i] instanceof Number) {
                        businessId = ((Number) args[i]).longValue();
                        break;
                    }
                }
            }
            if (businessId != null) break;
        }

        if (businessId == null) {
            // try to find parameter named businessId by type and position
            String[] paramNames = sig.getParameterNames();
            for (int i = 0; i < paramNames.length; i++) {
                if (varName.equals(paramNames[i]) && args[i] instanceof Number) {
                    businessId = ((Number) args[i]).longValue();
                    break;
                }
            }
        }

        if (businessId == null) {
            throw new AccessDeniedException("No se pudo determinar businessId para ownership check");
        }

        Optional<Business> bizOpt = businessRepo.findById(businessId);
        if (bizOpt.isEmpty()) {
            throw new com.example.reservas.service.NotFoundException("Business %d no existe".formatted(businessId));
        }
        Business biz = bizOpt.get();
        if (biz.getOwnerId() == null) {
            return; // no owner set -> allow
        }

        // get current username from security context via userRepo lookup on principal provided in args or SecurityContextHolder
        String username = null;
        for (Object a : args) {
            if (a instanceof java.security.Principal p) {
                username = p.getName();
                break;
            }
        }
        if (username == null) {
            // fallback to SecurityContextHolder
            var ctx = org.springframework.security.core.context.SecurityContextHolder.getContext();
            if (ctx != null && ctx.getAuthentication() != null && ctx.getAuthentication().getName() != null) {
                username = ctx.getAuthentication().getName();
            }
        }
        if (username == null) {
            throw new AccessDeniedException("Autenticación requerida");
        }
        Long currentUserId = userRepo.findByUsername(username).map(com.example.reservas.domain.User::getId)
                .orElseThrow(() -> new AccessDeniedException("Autenticación requerida"));
        if (!currentUserId.equals(biz.getOwnerId())) {
            throw new AccessDeniedException("No eres el propietario");
        }
    }
}
