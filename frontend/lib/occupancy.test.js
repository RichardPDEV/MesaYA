import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTableOccupancy, summarizeOccupancy } from './occupancy.js';

test('deriva estados de mesa desde reservas activas y futuras', () => {
  const now = new Date('2026-06-27T21:00:00Z');
  const tables = [
    { id: 'T1', seats: 4, floor: 1, status: 'available' },
    { id: 'T2', seats: 2, floor: 1, status: 'available' },
    { id: 'T3', seats: 4, floor: 1, status: 'available' },
  ];

  const reservations = [
    {
      tableId: 'T1',
      startTime: '2026-06-27T20:00:00Z',
      endTime: '2026-06-27T23:00:00Z',
      status: 'CONFIRMED',
    },
    {
      tableId: 'T2',
      startTime: '2026-06-27T22:00:00Z',
      endTime: '2026-06-27T23:30:00Z',
      status: 'CONFIRMED',
    },
  ];

  const nextTables = buildTableOccupancy(tables, reservations, { now, guests: 2 });
  assert.equal(nextTables[0].status, 'occupied');
  assert.equal(nextTables[1].status, 'reserved');
  assert.equal(nextTables[2].status, 'available');

  const summary = summarizeOccupancy(nextTables);
  assert.deepEqual(summary, { available: 1, occupied: 1, reserved: 1, total: 3 });
});
