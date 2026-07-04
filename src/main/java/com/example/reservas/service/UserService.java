package com.example.reservas.service;

import com.example.reservas.domain.User;
import com.example.reservas.repo.UserRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class UserService {
    private final UserRepository userRepo;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public UserService(UserRepository userRepo) { this.userRepo = userRepo; }

    public User register(String username, String password, String displayName) {
        String normalizedUsername = username == null ? "" : username.trim().toLowerCase();
        String normalizedDisplayName = displayName == null ? "" : displayName.trim();
        if (normalizedUsername.isBlank() || password == null || password.isBlank() || normalizedDisplayName.isBlank()) {
            throw new ValidationException("campos_requeridos");
        }
        if (userRepo.findByUsername(normalizedUsername).isPresent()) throw new ValidationException("username ya existe");
        User u = new User();
        u.setUsername(normalizedUsername);
        u.setPasswordHash(passwordEncoder.encode(password));
        u.setDisplayName(normalizedDisplayName);
        u.setRole(com.example.reservas.domain.UserRole.USER);
        return userRepo.save(u);
    }

    public Optional<User> authenticate(String username, String password) {
        return userRepo.findByUsername(username).filter(u -> passwordEncoder.matches(password, u.getPasswordHash()));
    }

    public void saveRefreshToken(Long userId, String refreshToken) {
        userRepo.findById(userId).ifPresent(u -> { u.setRefreshToken(refreshToken); userRepo.save(u); });
    }

    public Optional<User> findByUsername(String username) {
        return userRepo.findByUsername(username);
    }
}
