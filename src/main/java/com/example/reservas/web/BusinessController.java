package com.example.reservas.web;

import com.example.reservas.domain.Business;
import com.example.reservas.domain.User;
import com.example.reservas.repo.BusinessRepository;
import com.example.reservas.repo.UserRepository;
import com.example.reservas.service.NotFoundException;
import com.example.reservas.service.ValidationException;
import com.example.reservas.web.dto.BusinessResponse;
import com.example.reservas.web.dto.CreateBusinessRequest;
import com.example.reservas.web.dto.UpdateBusinessRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/businesses")
@Tag(name = "Businesses", description = "Gestión de negocios")
public class BusinessController {
    private final BusinessRepository businessRepo;
    private final UserRepository userRepo;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public BusinessController(BusinessRepository businessRepo, UserRepository userRepo) {
        this.businessRepo = businessRepo;
        this.userRepo = userRepo;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Crear negocio")
    public BusinessResponse create(@Valid @RequestBody CreateBusinessRequest req, java.security.Principal principal) {
        validateTableLayoutJson(req.tableLayoutJson());

        Business business = new Business();
        business.setName(req.name());
        business.setType(req.type());
        business.setCuisine(req.cuisine());
        business.setAddress(req.address());
        business.setPhone(req.phone());
        business.setDescription(req.description());
        business.setTableLayoutJson(req.tableLayoutJson());

        if (principal != null) {
            userRepo.findByUsername(principal.getName()).ifPresent(user -> business.setOwnerId(user.getId()));
        }

        Business saved = businessRepo.save(business);
        return toResponse(saved);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtener negocio por id")
    public BusinessResponse get(@PathVariable Long id) {
        Business business = businessRepo.findById(id)
                .orElseThrow(() -> new NotFoundException("Business %d no existe".formatted(id)));
        return toResponse(business);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualizar perfil de negocio")
    @com.example.reservas.security.RequireBusinessOwner(pathVariable = "id")
    public BusinessResponse update(@PathVariable Long id, @RequestBody UpdateBusinessRequest req, java.security.Principal principal) {
        if (req.tableLayoutJson() != null) {
            validateTableLayoutJson(req.tableLayoutJson());
        }

        return businessRepo.findById(id)
                .map(existing -> {
                    requireOwner(existing, principal);
                    if (req.name() != null) existing.setName(req.name());
                    if (req.type() != null) existing.setType(req.type());
                    if (req.cuisine() != null) existing.setCuisine(req.cuisine());
                    if (req.address() != null) existing.setAddress(req.address());
                    if (req.phone() != null) existing.setPhone(req.phone());
                    if (req.description() != null) existing.setDescription(req.description());
                    if (req.tableLayoutJson() != null) existing.setTableLayoutJson(req.tableLayoutJson());
                    return toResponse(businessRepo.save(existing));
                })
                .orElseThrow(() -> new NotFoundException("Business %d no existe".formatted(id)));
    }

    private void requireOwner(Business existing, java.security.Principal principal) {
        if (existing.getOwnerId() == null) {
            return;
        }
        if (principal == null) {
            throw new AccessDeniedException("No eres el propietario");
        }

        Long currentUserId = userRepo.findByUsername(principal.getName())
                .map(User::getId)
                .orElseThrow(() -> new AccessDeniedException("No eres el propietario"));

        if (!currentUserId.equals(existing.getOwnerId())) {
            throw new AccessDeniedException("No eres el propietario");
        }
    }

    private BusinessResponse toResponse(Business business) {
        return new BusinessResponse(
                business.getId(),
                business.getName(),
                business.getType(),
                business.getCuisine(),
                business.getAddress(),
                business.getPhone(),
                business.getDescription(),
                business.getTableLayoutJson());
    }

    private void validateTableLayoutJson(String json) {
        if (json == null || json.isBlank()) {
            return;
        }
        try {
            objectMapper.readTree(json);
        } catch (JsonProcessingException ex) {
            throw new ValidationException("tableLayoutJson debe ser JSON válido");
        }
    }
}
