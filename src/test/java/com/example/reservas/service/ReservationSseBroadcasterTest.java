package com.example.reservas.service;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ReservationSseBroadcasterTest {

    @Test
    void emitsToSubscribersOfMatchingResource() throws Exception {
        ReservationSseBroadcaster broadcaster = new ReservationSseBroadcaster();
        RecordingEmitter emitter = new RecordingEmitter();

        broadcaster.subscribe(42L, emitter);
        broadcaster.emitReservationChanged(42L, Map.of("resourceId", 42L, "kind", "reservation-updated"));

        assertEquals(1, emitter.calls);
    }

    private static class RecordingEmitter extends SseEmitter {
        private int calls;

        @Override
        public void send(SseEventBuilder builder) throws IOException {
            calls++;
        }
    }
}
