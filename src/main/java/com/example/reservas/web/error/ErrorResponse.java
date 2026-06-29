package com.example.reservas.web.error;

public record ErrorResponse(long timestamp, int status, String error, String message, String path) {
}
