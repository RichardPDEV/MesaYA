package com.example.reservas.service;

import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

@Service
public class ReservationSseBroadcaster {

    private final Map<Long, Set<SseEmitter>> subscribersByResource = new ConcurrentHashMap<>();

    public SseEmitter subscribe(Long resourceId, SseEmitter emitter) {
        if (resourceId == null || emitter == null) {
            return emitter;
        }

        subscribersByResource.computeIfAbsent(resourceId, ignored -> new CopyOnWriteArraySet<>()).add(emitter);
        emitter.onCompletion(() -> unsubscribe(resourceId, emitter));
        emitter.onTimeout(() -> unsubscribe(resourceId, emitter));
        emitter.onError((ex) -> unsubscribe(resourceId, emitter));
        return emitter;
    }

    public void emitReservationChanged(Long resourceId, Object payload) {
        if (resourceId == null) {
            return;
        }

        Set<SseEmitter> subscribers = subscribersByResource.getOrDefault(resourceId, Collections.emptySet());
        for (SseEmitter emitter : subscribers) {
            try {
                emitter.send(SseEmitter.event().name("reservation-change").data(payload));
            } catch (IOException e) {
                unsubscribe(resourceId, emitter);
            }
        }
    }

    public void unsubscribe(Long resourceId, SseEmitter emitter) {
        if (resourceId == null || emitter == null) {
            return;
        }
        Set<SseEmitter> subscribers = subscribersByResource.get(resourceId);
        if (subscribers != null) {
            subscribers.remove(emitter);
            if (subscribers.isEmpty()) {
                subscribersByResource.remove(resourceId);
            }
        }
    }
}
