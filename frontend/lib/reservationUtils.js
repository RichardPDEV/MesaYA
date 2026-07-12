export const getReservationStartTime = (reservation) => {
  if (reservation?.startTime) {
    const start = new Date(reservation.startTime);
    if (!Number.isNaN(start.getTime())) return start;
  }
  if (reservation?.date && reservation?.time) {
    const fallback = new Date(`${reservation.date}T${reservation.time}:00`);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  return null;
};

export const isUpcomingReservation = (value, now = Date.now()) => {
  const parsed = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > now;
};

export const getReservationStatusMeta = (reservation, now = Date.now()) => {
  const startTimeValue = getReservationStartTime(reservation);
  const endTimeValue = reservation?.endTime ? new Date(reservation.endTime) : null;
  const status = reservation?.status || "CONFIRMED";

  if (["CANCELLED", "LATE_CANCELLED"].includes(status)) {
    return {
      label: "Cancelada",
      tone: "#b91c1c",
      message: "Tu reserva se canceló correctamente. Puedes volver a reservar cuando quieras.",
      canCancel: false,
      canRebook: true,
      state: "cancelled",
    };
  }

  if (startTimeValue && startTimeValue.getTime() > now) {
    const hoursLeft = (startTimeValue.getTime() - now) / 3600000;
    if (hoursLeft <= 1) {
      return {
        label: "Próxima",
        tone: "#f59e0b",
        message: "Tu reserva está muy próxima. Te enviaremos un aviso de último momento.",
        canCancel: true,
        canRebook: true,
        state: "upcoming",
      };
    }
    if (hoursLeft <= 24) {
      return {
        label: "Próxima",
        tone: "#2563eb",
        message: "Tu reserva está muy cerca. Te mantendremos informado.",
        canCancel: true,
        canRebook: true,
        state: "upcoming",
      };
    }
    return {
      label: "Confirmada",
      tone: "#15803d",
      message: "Tu reserva quedó confirmada y está lista para disfrutar.",
      canCancel: true,
      canRebook: true,
      state: "confirmed",
    };
  }

  if (startTimeValue && endTimeValue && endTimeValue.getTime() < now) {
    return {
      label: "Finalizada",
      tone: "#64748b",
      message: "Tu reserva ya pasó. Gracias por tu visita.",
      canCancel: false,
      canRebook: true,
      state: "finished",
    };
  }

  if (startTimeValue) {
    return {
      label: "En curso",
      tone: "#0f766e",
      message: "Tu reserva está en curso.",
      canCancel: false,
      canRebook: false,
      state: "active",
    };
  }

  return {
    label: "Pendiente",
    tone: "#64748b",
    message: "Tu reserva está pendiente de confirmación.",
    canCancel: true,
    canRebook: true,
    state: "pending",
  };
};
