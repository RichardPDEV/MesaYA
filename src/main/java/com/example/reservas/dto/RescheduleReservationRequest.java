package com.example.reservas.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;

public record RescheduleReservationRequest(
    @NotNull Long resourceId,
    @NotBlank String tableId,
    @NotNull OffsetDateTime startTime,
    @NotNull OffsetDateTime endTime,
    String reason
) {}
