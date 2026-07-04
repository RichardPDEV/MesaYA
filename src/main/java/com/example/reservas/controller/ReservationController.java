package com.example.reservas.controller;

import com.example.reservas.dto.CancelReservationRequest;
import com.example.reservas.dto.CreateReservationRequest;
import com.example.reservas.dto.ReservationResponse;
import com.example.reservas.service.ReservationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

import java.net.URI;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Controlador para gestión de reservas.
 * Maneja la creación y cancelación de reservas.
 */
@RestController("apiReservationController")
@RequestMapping("/api/reservations")
@Tag(name = "Reservations", description = "Gestión de reservas: creación y cancelación")
public class ReservationController {

    private final ReservationService reservationService;

    public ReservationController(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    /**
     * Crea una nueva reserva.
     *
     * @param request datos de la reserva a crear
     * @return la reserva creada con header Location
     */
    @PostMapping
    @Operation(
            summary = "Crear nueva reserva",
            description = "Crea una nueva reserva validando disponibilidad, capacidad y solapamientos. " +
                    "Retorna la reserva creada con código 201 y header Location."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Reserva creada exitosamente"),
            @ApiResponse(responseCode = "400", description = "Datos de entrada inválidos o validación fallida"),
            @ApiResponse(responseCode = "404", description = "Recurso no encontrado"),
            @ApiResponse(responseCode = "409", description = "Conflicto (ej: solapamiento de horarios)")
    })
    public ResponseEntity<ReservationResponse> create(
            @Valid @RequestBody CreateReservationRequest request,
            Authentication authentication
    ) {
        ReservationResponse created = reservationService.create(request, authentication != null ? authentication.getName() : null);
        URI location = URI.create("/api/reservations/" + created.id());
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(location)
                .body(created);
    }

    /**
     * Cancela una reserva existente aplicando la política de cancelación.
     *
     * @param id ID de la reserva a cancelar
     * @param body razón de cancelación
     * @return la reserva cancelada con estado actualizado
     */
    @PostMapping("/{id}/cancel")
    @Operation(
            summary = "Cancelar reserva",
            description = "Cancela una reserva existente aplicando la política de cancelación del negocio. " +
                    "La clasificación (FREE o LATE) se determina según el tiempo transcurrido hasta el inicio de la reserva."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Reserva cancelada exitosamente"),
            @ApiResponse(responseCode = "400", description = "La reserva no está en estado válido para cancelación"),
            @ApiResponse(responseCode = "404", description = "Reserva no encontrada")
    })
    public ReservationResponse cancel(
            @Parameter(description = "ID de la reserva a cancelar", required = true, example = "1")
            @PathVariable @NotNull Long id,
            
            @Valid @RequestBody CancelReservationRequest body
    ) {
        // Usamos "now" en UTC para alinear con la lógica de negocio
        return reservationService.cancel(id, body.reason(), OffsetDateTime.now(ZoneOffset.UTC));
    }
}

