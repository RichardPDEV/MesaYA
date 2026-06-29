package com.example.reservas.web.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateBusinessRequest(
    @NotBlank String name,
    @NotBlank String type,
    String cuisine,
    String address,
    String phone,
    String description,
    String tableLayoutJson
) {}
