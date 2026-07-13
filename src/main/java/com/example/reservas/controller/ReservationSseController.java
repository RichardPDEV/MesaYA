package com.example.reservas.controller;

import com.example.reservas.service.ReservationSseBroadcaster;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/resources")
@Tag(name = "SSE", description = "Canal de eventos en tiempo real para reservas")
public class ReservationSseController {

    private final ReservationSseBroadcaster broadcaster;

    public ReservationSseController(ReservationSseBroadcaster broadcaster) {
        this.broadcaster = broadcaster;
    }

    @GetMapping(value = "{resourceId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Suscribirse a cambios de reservas", description = "Abre un canal SSE para recibir actualizaciones de ocupación del recurso")
    public SseEmitter subscribe(@PathVariable Long resourceId) {
        SseEmitter emitter = new SseEmitter(0L);
        return broadcaster.subscribe(resourceId, emitter);
    }
}
