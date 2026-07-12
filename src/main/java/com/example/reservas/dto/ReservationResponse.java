package com.example.reservas.dto;
import java.time.OffsetDateTime;

public record ReservationResponse(
    Long id,
    Long resourceId,
    String tableId,
    Long userId,
    String customerName,
    String customerEmail,
    Integer partySize,
    OffsetDateTime startTime,
    OffsetDateTime endTime,
    String status,
    String restaurantName,
    String tableLabel,
    String cancellationReason,
    OffsetDateTime createdAt
) {}