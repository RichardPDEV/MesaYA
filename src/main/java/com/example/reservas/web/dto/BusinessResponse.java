package com.example.reservas.web.dto;

public record BusinessResponse(
    Long id,
    String name,
    String type,
    String cuisine,
    String address,
    String phone,
    String description,
    String tableLayoutJson
) {}
