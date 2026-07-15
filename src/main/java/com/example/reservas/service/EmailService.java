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

    public void sendConfirmationCode(String to, String code) {
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            msg.setFrom(fromAddress);
            msg.setTo(to);
            msg.setSubject("Código de confirmación");
            msg.setText(String.format("Tu código de confirmación es: %s\nSi no solicitaste este código, ignora este correo.", code));
            mailSender.send(msg);
            log.info("Sent confirmation code to {}", to);
        } catch (Exception ex) {
            log.error("Failed to send confirmation email to {}", to, ex);
            log.error("Mail send error details:", ex);
        }
    }
}
