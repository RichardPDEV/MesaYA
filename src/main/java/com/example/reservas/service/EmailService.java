package com.example.reservas.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {
    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;

    @Value("${app.mail.from:reservas@example.com}")
    private String fromAddress;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public boolean sendConfirmationCode(String to, String code) {
        try {
            String resolvedFrom = normalizeFromAddress(fromAddress);
            SimpleMailMessage msg = new SimpleMailMessage();
            msg.setFrom(resolvedFrom);
            msg.setTo(to);
            msg.setSubject("Código de confirmación");
            msg.setText(String.format("Tu código de confirmación es: %s\nSi no solicitaste este código, ignora este correo.", code));
            mailSender.send(msg);
            log.info("Sent confirmation code from {} to {}", resolvedFrom, to);
            return true;
        } catch (Exception ex) {
            log.error("Failed to send confirmation email to {}", to, ex);
            log.error("Mail send error details:", ex);
            return false;
        }
    }

    private String normalizeFromAddress(String configuredAddress) {
        if (configuredAddress == null || configuredAddress.isBlank()) {
            return "onboarding@resend.dev";
        }
        String trimmed = configuredAddress.trim();
        if (trimmed.contains("example.com") || trimmed.contains("gmail.com")) {
            return "onboarding@resend.dev";
        }
        return trimmed;
    }
}
