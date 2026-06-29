package com.example.reservas.web.dto;

public class AuthRequests {
    public record Register(String username, String password, String displayName) {}
    public record Login(String username, String password) {}
}
