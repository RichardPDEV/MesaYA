import test from 'node:test';
import assert from 'node:assert/strict';
import { getReservationStatusMeta, getReservationStartTime, isUpcomingReservation } from './reservationUtils.js';

test('marca una reserva futura como confirmada y próxima', () => {
  const now = new Date('2026-06-26T18:00:00Z').getTime();
  const reservation = {
    status: 'CONFIRMED',
    startTime: '2026-06-26T20:00:00Z',
    endTime: '2026-06-26T22:00:00Z',
  };

  const meta = getReservationStatusMeta(reservation, now);
  assert.equal(meta.label, 'Próxima');
  assert.equal(meta.tone, '#2563eb');
  assert.equal(meta.canCancel, true);
});

test('detecta reservas en curso y finalizadas correctamente', () => {
  const now = new Date('2026-06-26T21:30:00Z').getTime();
  const ongoing = {
    status: 'CONFIRMED',
    startTime: '2026-06-26T20:00:00Z',
    endTime: '2026-06-26T23:00:00Z',
  };
  const finished = {
    status: 'CONFIRMED',
    startTime: '2026-06-26T18:00:00Z',
    endTime: '2026-06-26T19:00:00Z',
  };

  assert.equal(getReservationStatusMeta(ongoing, now).label, 'En curso');
  assert.equal(getReservationStatusMeta(finished, now).label, 'Finalizada');
});

test('detecta si una reserva ya pasó o todavía está por venir', () => {
  const now = new Date('2026-06-26T21:00:00Z').getTime();
  assert.equal(isUpcomingReservation('2026-06-26T22:00:00Z', now), true);
  assert.equal(isUpcomingReservation('2026-06-26T20:00:00Z', now), false);
  const startTime = getReservationStartTime({ startTime: '2026-06-26T22:00:00Z' });
  assert.ok(startTime);
});
