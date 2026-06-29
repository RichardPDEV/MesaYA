package com.example.reservas.web;

import com.example.reservas.domain.Resource;
import com.example.reservas.service.ResourceService;
import com.example.reservas.web.dto.CreateResourceRequest;
import com.example.reservas.web.dto.ResourceResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1")
@Tag(name = "Resources", description = "Gestión de recursos reservables")
public class ResourceController {
    private final ResourceService resourceService;
    private final com.example.reservas.repo.UserRepository userRepo;
    private final com.example.reservas.repo.BusinessRepository businessRepo;

    public ResourceController(ResourceService resourceService, com.example.reservas.repo.UserRepository userRepo, com.example.reservas.repo.BusinessRepository businessRepo) {
        this.resourceService = resourceService;
        this.userRepo = userRepo;
        this.businessRepo = businessRepo;
    }

    @PostMapping("/businesses/{businessId}/resources")
    @Operation(summary = "Crear recurso en un negocio")
    @com.example.reservas.security.RequireBusinessOwner(pathVariable = "businessId")
    public ResourceResponse create(@PathVariable Long businessId, @Valid @RequestBody CreateResourceRequest req, java.security.Principal principal) {
        if (!businessId.equals(req.businessId())) {
            throw new com.example.reservas.service.ValidationException("businessId en path y body deben coincidir");
        }
        // ownership is validated by aspect
        com.example.reservas.domain.Business business = businessRepo.findById(businessId)
            .orElseThrow(() -> new com.example.reservas.service.NotFoundException("Business %d no existe".formatted(businessId)));
        Resource r = resourceService.create(req.businessId(), req.name(), req.capacity());
        return toResponse(r);
    }

    @GetMapping("/resources/{id}")
    @Operation(summary = "Obtener recurso por id")
    public ResourceResponse get(@PathVariable Long id) {
        Resource r = resourceService.get(id);
        return toResponse(r);
    }

    @GetMapping("/resources")
    @Operation(summary = "Listar recursos por negocio (paginado)")
    public Page<ResourceResponse> list(@RequestParam Long businessId, Pageable pageable) {
        return resourceService.listByBusiness(businessId, pageable).map(this::toResponse);
    }

    private ResourceResponse toResponse(Resource r) {
        return new ResourceResponse(r.getId(), r.getBusiness().getId(), r.getName(), r.getCapacity());
    }
}
