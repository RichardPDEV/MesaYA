package com.example.reservas.dto;

import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;

public record CreateReservationRequest(
    @NotNull Long resourceId,
    @NotBlank String customerName,
    @Email @NotBlank String customerEmail,
    @NotNull @Positive Integer partySize,
    @NotBlank String tableId,
    @NotNull OffsetDateTime startTime,
    @NotNull OffsetDateTime endTime
) {}