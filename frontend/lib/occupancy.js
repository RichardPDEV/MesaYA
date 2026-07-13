const getReservationWindow = (reservation) => {
  if (!reservation?.startTime || !reservation?.endTime) return null;
  const start = new Date(reservation.startTime);
  const end = new Date(reservation.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
};

export function buildTableOccupancy(tables = [], reservations = [], options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const guests = Math.max(1, Number(options.guests || 1));
  const stateByTable = new Map();

  (reservations || []).forEach((reservation) => {
    if (!reservation?.tableId) return;
    const window = getReservationWindow(reservation);
    if (!window) return;
    const isActive = window.start <= now && window.end >= now;
    const resolvedState = isActive ? 'occupied' : 'reserved';
    const previous = stateByTable.get(reservation.tableId);
    if (!previous || (resolvedState === 'occupied' && previous !== 'occupied')) {
      stateByTable.set(reservation.tableId, resolvedState);
    }
  });

  return (tables || []).map((table) => {
    const seatsFit = Number(table.seats || 0) >= guests;
    const tableState = stateByTable.get(table.id);
    const status = tableState ? (seatsFit ? tableState : 'occupied') : seatsFit ? 'available' : 'occupied';
    return { ...table, status };
  });
}

export function summarizeOccupancy(tables = []) {
  return (tables || []).reduce(
    (summary, table) => {
      const status = table?.status || 'available';
      if (status === 'occupied') summary.occupied += 1;
      else if (status === 'reserved') summary.reserved += 1;
      else summary.available += 1;
      summary.total += 1;
      return summary;
    },
    { available: 0, occupied: 0, reserved: 0, total: 0 }
  );
}
