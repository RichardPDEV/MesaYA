package com.example.reservas.web.dto;

public interface ValidatedBusinessRequest {
    String name();
    String type();
    String cuisine();
    String address();
    String phone();
    String description();
    String tableLayoutJson();
}
