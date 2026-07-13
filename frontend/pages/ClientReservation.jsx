import React, { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, APP_CARD, APP_BORDER, CARD_SHADOW } from "../lib/constants.js";
import { requestJson } from "../lib/api.js";
import FloorPlan from "../components/FloorPlan.jsx";
import { Label, inputStyle } from "../components/FormFields.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getReservationStartTime, getReservationStatusMeta, isUpcomingReservation } from "../lib/reservationUtils.js";

const parseTimeToMinutes = (time) => {
  const [hours, minutes] = (time || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
};

const formatMinutesToTime = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const addMinutesToTime = (time, minutesToAdd) => {
  const total = parseTimeToMinutes(time) + minutesToAdd;
  const normalized = Math.max(0, Math.min(24 * 60 - 1, total));
  return formatMinutesToTime(normalized);
};

const buildReservationWindow = (date, startTime, endTime) => {
  const [year, month, day] = (date || "2026-06-27").split("-").map(Number);
  const [startHour, startMinute] = (startTime || "20:00").split(":").map(Number);
  const effectiveEnd = endTime || addMinutesToTime(startTime || "20:00", 120);
  const [endHour, endMinute] = effectiveEnd.split(":").map(Number);
  const start = new Date(year, month - 1, day, startHour, startMinute, 0, 0);
  const end = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
  return { start, end };
};

const getDurationMinutes = (startTime, endTime) => parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime);

const hasTimeOverlap = (startA, endA, startB, endB) => startA < endB && startB < endA;

const CLIENT_RESERVATIONS_KEY = "mesaYa-client-reservations";

const loadStoredReservations = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CLIENT_RESERVATIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const saveStoredReservation = (reservation) => {
  if (typeof window === "undefined") return;
  try {
    const prev = loadStoredReservations();
    const next = [reservation, ...prev.filter((item) => item.id !== reservation.id)].slice(0, 8);
    window.localStorage.setItem(CLIENT_RESERVATIONS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
};

const formatReservationDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ClientReservation({ restaurant, onBack, onConfirm }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [selectedTable, setSelectedTable] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("20:00");
  const [endTime, setEndTime] = useState("22:00");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState(2);
  const [step, setStep] = useState(1); // 1=select table, 2=fill form, 3=confirmed
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [displayTables, setDisplayTables] = useState(() => restaurant?.tables || []);
  const [activeFloor, setActiveFloor] = useState(() => {
    const floors = Array.from(new Set((restaurant?.tables || []).map((table) => Number(table.floor || 1))));
    return floors.sort((a, b) => a - b)[0] || 1;
  });
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [reservationLoadError, setReservationLoadError] = useState("");
  const [availabilityWindows, setAvailabilityWindows] = useState([]);
  const [isSubmittingReservation, setIsSubmittingReservation] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [requestedIntervalAvailable, setRequestedIntervalAvailable] = useState(true);
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [confirmationSummary, setConfirmationSummary] = useState(null);
  const [savedReservations, setSavedReservations] = useState([]);
  const [myReservations, setMyReservations] = useState([]);
  const [myReservationsLoading, setMyReservationsLoading] = useState(false);
  const [cancelingReservationId, setCancelingReservationId] = useState(null);
  const [reservationToReschedule, setReservationToReschedule] = useState(null);
  const [reminderEnabled, setReminderEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("mesaYa-reminders-enabled") !== "false";
    } catch {
      return true;
    }
  });
  const [reminderPermission, setReminderPermission] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return window.Notification.permission;
  });
  const [reminderMessage, setReminderMessage] = useState("");

  const loadMyReservations = useCallback(async () => {
    if (!isAuthenticated) {
      setMyReservations([]);
      return;
    }

    setMyReservationsLoading(true);
    try {
      const response = await requestJson(`${API_BASE_URL}/v1/reservations/mine`);
      const normalized = (Array.isArray(response) ? response : []).map((item) => {
        const startDate = item?.startTime ? new Date(item.startTime) : null;
        const formattedTime = item?.time || (startDate ? startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : null);
        return {
          id: item?.id,
          restaurantName: item?.restaurantName || restaurant?.name || "Restaurante",
          tableLabel: item?.tableLabel || item?.tableId || "Mesa",
          startTime: item?.startTime,
          endTime: item?.endTime,
          status: item?.status || "CONFIRMED",
          guests: item?.partySize || item?.guests || 1,
          date: item?.date || (startDate ? startDate.toISOString().slice(0, 10) : null),
          time: formattedTime,
          email: item?.email || "",
          createdAt: item?.createdAt || item?.startTime,
          cancellationReason: item?.cancellationReason || null,
        };
      });
      setMyReservations(normalized);
    } catch (err) {
      console.warn("No se pudieron cargar las reservas del usuario:", err);
      setMyReservations([]);
    } finally {
      setMyReservationsLoading(false);
    }
  }, [isAuthenticated, restaurant?.name]);

  const buildAvailability = (tables, reservations) => {
    const { start, end } = buildReservationWindow(date, time, endTime);
    const now = new Date();
    const reservationStateByTable = new Map();

    (reservations || []).forEach((res) => {
      if (!res?.tableId) return;
      const reservationStart = res?.startTime ? new Date(res.startTime) : null;
      const reservationEnd = res?.endTime ? new Date(res.endTime) : null;
      if (!reservationStart || !reservationEnd || !hasTimeOverlap(reservationStart, reservationEnd, start, end)) {
        return;
      }

      const isActive = reservationStart <= now && reservationEnd >= now;
      const resolvedState = isActive ? "occupied" : "reserved";
      const previous = reservationStateByTable.get(res.tableId);
      if (!previous || (resolvedState === "occupied" && previous !== "occupied")) {
        reservationStateByTable.set(res.tableId, resolvedState);
      }
    });

    return (tables || []).map((table) => {
      const seatsFit = Number(table.seats || 0) >= Math.max(1, Number(guests || 1));
      const tableState = reservationStateByTable.get(table.id);
      const status = tableState ? (seatsFit ? tableState : "occupied") : seatsFit ? "available" : "occupied";
      return {
        ...table,
        status,
      };
    });
  };

  const evaluateRequestedInterval = (windows, startTime, endTime) => {
    if (!startTime || !endTime) {
      return { message: "", available: true };
    }
    const duration = getDurationMinutes(startTime, endTime);
    if (duration <= 0) {
      return { message: "La hora de fin debe ser posterior a la hora de inicio.", available: false };
    }
    if (duration > 120) {
      return { message: "La reserva puede durar máximo 2 horas.", available: false };
    }

    const requestStart = new Date(`${date}T${startTime}:00Z`);
    const requestEnd = new Date(`${date}T${endTime}:00Z`);
    let isAvailable = false;
    let bestCandidate = null;
    let bestDiff = Number.POSITIVE_INFINITY;

    (windows || []).forEach((window) => {
      const windowStart = new Date(window.start);
      const windowEnd = new Date(window.end);
      if (windowStart <= requestStart && windowEnd >= requestEnd) {
        isAvailable = true;
        return;
      }
      const windowDuration = (windowEnd.getTime() - windowStart.getTime()) / 60000;
      if (windowDuration < duration) return;

      const latestStart = new Date(windowEnd.getTime() - duration * 60000);
      let candidateStart = requestStart;
      if (candidateStart < windowStart) {
        candidateStart = windowStart;
      }
      if (candidateStart > latestStart) {
        candidateStart = latestStart;
      }
      if (candidateStart < windowStart) return;

      const diff = Math.abs(candidateStart.getTime() - requestStart.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestCandidate = candidateStart;
      }
    });

    if (isAvailable) {
      return { message: "El horario solicitado está disponible.", available: true };
    }
    if (!bestCandidate) {
      return { message: "No hay disponibilidad para ese intervalo en esta fecha.", available: false };
    }

    const suggestedTime = `${String(bestCandidate.getUTCHours()).padStart(2, "0")}:${String(bestCandidate.getUTCMinutes()).padStart(2, "0")}`;
    return {
      message: `No está disponible a esa hora. La opción más cercana es ${suggestedTime}.`,
      available: false,
    };
  };

  const loadAvailability = useCallback(async () => {
    if (!restaurant) return;
    setLoadingReservations(true);
    setReservationLoadError("");

    let reservations = [];
    let windows = [];

    const resourceId = restaurant?.backendResourceId || restaurant?.resourceId;
    if (!resourceId) {
      setDisplayTables(buildAvailability(restaurant?.tables || [], []));
      setAvailabilityWindows([]);
      setAvailabilityMessage("Sugerencias de horario no disponibles para este restaurante.");
      setRequestedIntervalAvailable(true);
      setLastRefreshAt(new Date());
      setLoadingReservations(false);
      return;
    }

    try {
      reservations = await requestJson(`${API_BASE_URL}/api/resources/${resourceId}/reservations?date=${date}`);
      setDisplayTables(buildAvailability(restaurant.tables || [], reservations || []));
    } catch (err) {
      console.warn("No se pudo cargar las reservas del día:", err);
      setDisplayTables(buildAvailability(restaurant?.tables || [], []));
      setReservationLoadError("No se pudo cargar las reservas actuales");
    }

    try {
      windows = await requestJson(`${API_BASE_URL}/api/resources/${resourceId}/availability?date=${date}`);
      setAvailabilityWindows(windows || []);
      const evaluation = evaluateRequestedInterval(windows || [], time, endTime);
      setAvailabilityMessage(evaluation.message);
      setRequestedIntervalAvailable(evaluation.available);
    } catch (err) {
      console.warn("No se pudo cargar la disponibilidad del día:", err);
      setAvailabilityMessage("No se pudo obtener sugerencias de horario.");
      setRequestedIntervalAvailable(true);
    } finally {
      setLastRefreshAt(new Date());
      setLoadingReservations(false);
    }
  }, [date, endTime, guests, restaurant, time]);

  useEffect(() => {
    setSavedReservations(loadStoredReservations());
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timerId = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timerId);
  }, [feedback]);

  useEffect(() => {
    if (!reminderEnabled || typeof window === "undefined") return;

    const upcomingEntries = [...myReservations, ...savedReservations]
      .map((reservation) => ({ reservation, startTime: getReservationStartTime(reservation) }))
      .filter(({ startTime }) => startTime && isUpcomingReservation(startTime))
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 3);

    if (!upcomingEntries.length) {
      return;
    }

    const timers = upcomingEntries.map(({ reservation, startTime }) => {
      const reminderAt = startTime.getTime() - 60 * 60 * 1000;
      const remaining = reminderAt - Date.now();
      if (remaining <= 0) return null;
      return window.setTimeout(() => {
        const label = reservation.restaurantName || "tu reserva";
        const startLabel = startTime.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        setReminderMessage(`Tu reserva en ${label} empieza a las ${startLabel}.`);
        if (typeof window !== "undefined" && "Notification" in window && window.Notification.permission === "granted") {
          new window.Notification("Recordatorio de reserva", {
            body: `Tu reserva en ${label} empieza a las ${startLabel}.`,
            icon: "/favicon.svg",
            tag: "mesa-ya-reminder",
          });
        }
        if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification("Recordatorio de reserva", {
              body: `Tu reserva en ${label} empieza a las ${startLabel}.`,
              icon: "/favicon.svg",
              tag: "mesa-ya-reminder",
            });
          }).catch(() => {
            // ignore service worker issues
          });
        }
      }, remaining);
    }).filter(Boolean);

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [reminderEnabled, myReservations, savedReservations]);

  useEffect(() => {
    loadMyReservations();
  }, [loadMyReservations]);

  useEffect(() => {
    const floors = Array.from(new Set((restaurant?.tables || []).map((table) => Number(table.floor || 1))));
    floors.sort((a, b) => a - b);
    if (!floors.length) return;
    if (!floors.includes(activeFloor)) {
      setActiveFloor(floors[0]);
    }
  }, [restaurant?.tables, activeFloor]);

  useEffect(() => {
    if (selectedTable && Number(selectedTable.floor || 1) !== Number(activeFloor)) {
      setSelectedTable(null);
    }
  }, [activeFloor, selectedTable]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.warn("Logout request failed", err);
    }
    setProfileError("");
    setProfileMenuOpen(false);
    setName("");
    setEmail("");
    setAuthName("");
    setAuthEmail("");
    setAuthPassword("");
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setProfileError("");
      setName("");
      setEmail("");
      return;
    }
    if (user?.displayName) setName(user.displayName);
    if (user?.username) setEmail(user.username);
  }, [isAuthenticated, user?.displayName, user?.username]);

  useEffect(() => {
    if (!restaurant) return;

    loadAvailability();
    const intervalId = window.setInterval(() => {
      loadAvailability();
    }, 10000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadAvailability();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadAvailability, restaurant]);

  useEffect(() => {
    if (!selectedTable) return;
    const maxAllowedGuests = Math.min(8, Number(selectedTable.seats || 8));
    if (guests < 1) {
      setGuests(1);
    } else if (guests > maxAllowedGuests) {
      setGuests(maxAllowedGuests);
    }
  }, [selectedTable?.seats, guests]);

  useEffect(() => {
    if (!selectedTable) return;
    const matchingTable = displayTables.find((table) => table.id === selectedTable.id);
    if (!matchingTable) {
      setSelectedTable(null);
      return;
    }
    if (matchingTable.status !== selectedTable.status) {
      if (matchingTable.status !== "available") {
        setSelectedTable(null);
      } else {
        setSelectedTable(matchingTable);
      }
    }
  }, [displayTables, selectedTable]);

  if (!restaurant) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: APP_CARD, borderRadius: 24, padding: "32px 28px", textAlign: "center", maxWidth: 420, boxShadow: CARD_SHADOW, border: `1px solid ${APP_BORDER}` }}>
          <p style={{ margin: "0 0 16px", color: "#64748b" }}>No se pudo cargar el restaurante seleccionado.</p>
          <button onClick={onBack} style={{ background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "12px 20px", cursor: "pointer", fontWeight: 700 }}>
            Volver
          </button>
        </div>
      </div>
    );
  }



  const openHour = parseInt((restaurant.openTime || "12:00").split(":")[0], 10);
  const closeHour = parseInt((restaurant.closeTime || "23:00").split(":")[0], 10);
  const times = [];
  for (let h = openHour; h <= closeHour - 1; h++) {
    times.push(`${String(h).padStart(2, "0")}:00`);
    times.push(`${String(h).padStart(2, "0")}:30`);
  }
  const today = new Date().toISOString().split("T")[0];
  const reservationDurationMinutes = getDurationMinutes(time, endTime);
  const durationError = reservationDurationMinutes <= 0
    ? "La hora de fin debe ser posterior a la hora de inicio."
    : reservationDurationMinutes > 120
      ? "La reserva puede durar máximo 2 horas."
      : "";
  const canConfirmReservation = !durationError && requestedIntervalAvailable;
  const suggestedEndMax = formatMinutesToTime(Math.min(parseTimeToMinutes(time) + 120, closeHour * 60));
  const canReviewReservation = Boolean(
    selectedTable &&
    name &&
    email &&
    guests >= 1 &&
    guests <= 8 &&
    (!selectedTable?.seats || guests <= selectedTable.seats) &&
    selectedTable?.status === "available" &&
    canConfirmReservation
  );

  const handleGuestsChange = (value) => {
    const parsedValue = Number(value);
    if (Number.isNaN(parsedValue)) {
      setGuests(1);
      return;
    }
    const clampedValue = Math.min(8, Math.max(1, parsedValue));
    setGuests(clampedValue);
  };

  const handleReviewReservation = () => {
    if (!canReviewReservation) return;
    setStep(2);
  };

  const showDesktopNotification = async (title, message) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission !== "granted") return;

    try {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(title, {
          body: message,
          icon: "/favicon.svg",
          tag: title,
        });
      } else {
        new window.Notification(title, {
          body: message,
          icon: "/favicon.svg",
          tag: title,
        });
      }
    } catch {
      // ignore notification errors
    }
  };

  const handleConfirm = async () => {
    if (!canReviewReservation) return;
    setIsSubmittingReservation(true);
    setProfileError("");
    setFeedback({ type: "info", message: "Confirmando tu reserva. Por favor espera..." });

    try {
      let created;
      let reservationSummary;

      if (reservationToReschedule?.id) {
        const updated = await requestJson(`${API_BASE_URL}/v1/reservations/${reservationToReschedule.id}/reschedule`, {
          method: "PATCH",
          body: JSON.stringify({
            resourceId: restaurant.backendResourceId || restaurant.resourceId,
            tableId: selectedTable.id,
            startTime: new Date(`${date}T${time}:00`).toISOString(),
            endTime: new Date(`${date}T${endTime}:00`).toISOString(),
            reason: "Reprogramada por el cliente",
          }),
        });
        created = updated;
        reservationSummary = {
          id: updated?.id?.toString() || reservationToReschedule.id,
          restaurantName: restaurant.name,
          tableLabel: selectedTable.label,
          date,
          time,
          endTime,
          guests,
          email,
          createdAt: new Date().toISOString(),
          startTime: new Date(`${date}T${time}:00`).toISOString(),
          status: "CONFIRMED",
          statusMessage: "Tu reserva fue reprogramada correctamente.",
        };
        setMyReservations((current) => current.map((reservation) => reservation.id === reservationToReschedule.id ? { ...reservation, ...reservationSummary, status: "CONFIRMED" } : reservation));
        setSavedReservations((current) => current.map((reservation) => reservation.id === reservationToReschedule.id ? { ...reservation, ...reservationSummary, status: "CONFIRMED" } : reservation));
      } else {
        created = await onConfirm({
          tableId: selectedTable.id,
          date,
          time,
          endTime,
          name,
          email,
          guests,
          floor: selectedTable.floor || 1,
          resourceId: restaurant.backendResourceId,
        });
        reservationSummary = {
          id: created?.id?.toString() || `R${Date.now()}`,
          restaurantName: restaurant.name,
          tableLabel: selectedTable.label,
          date,
          time,
          endTime,
          guests,
          email,
          createdAt: new Date().toISOString(),
          startTime: new Date(`${date}T${time}:00`).toISOString(),
          status: "CONFIRMED",
          statusMessage: "Tu reserva está confirmada y lista para disfrutar.",
        };
      }

      saveStoredReservation(reservationSummary);
      setSavedReservations(loadStoredReservations());
      setConfirmationSummary(reservationSummary);
      if (isAuthenticated) {
        await loadMyReservations();
      }
      setReservationToReschedule(null);
      const successMessage = reservationToReschedule?.id
        ? `Tu reserva se reprogramó correctamente para ${date} a las ${time}.`
        : `Tu reserva quedó confirmada para ${date} a las ${time}.`;
      setFeedback({
        type: "success",
        message: successMessage,
      });
      await showDesktopNotification("Reserva confirmada", successMessage);
      setStep(3);
    } catch (err) {
      await loadAvailability();
      setFeedback({ type: "error", message: err.message || "No se pudo confirmar la reserva. Inténtalo de nuevo." });
      setProfileError(err.message || "No se pudo confirmar la reserva");
      setStep(2);
    } finally {
      setIsSubmittingReservation(false);
    }
  };

  const handleEnableReminders = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setReminderMessage("Las alertas del navegador no están disponibles en este dispositivo.");
      return;
    }

    const permission = await window.Notification.requestPermission();
    setReminderPermission(permission);
    if (permission === "granted") {
      setReminderEnabled(true);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("mesaYa-reminders-enabled", "true");
        } catch {
          // ignore storage errors
        }
      }
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          registration.showNotification("Recordatorios activados", {
            body: "Recibirás avisos de tus reservas próximas.",
            icon: "/favicon.svg",
            tag: "mesa-ya-reminder",
          });
        } catch {
          // ignore notification registration issues
        }
      }
      setReminderMessage("Recordatorios activados. Te enviaremos un aviso 1 hora antes.");
    } else {
      setReminderEnabled(false);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("mesaYa-reminders-enabled", "false");
        } catch {
          // ignore storage errors
        }
      }
      setReminderMessage("Las alertas quedaron desactivadas para este navegador.");
    }
  };

  const handleCancelReservation = async (reservationId) => {
    if (!reservationId) return;
    setCancelingReservationId(reservationId);
    setFeedback({ type: "info", message: "Cancelando tu reserva..." });
    try {
      await requestJson(`${API_BASE_URL}/v1/reservations/${reservationId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason: "Cancelada por el cliente" }),
      });
      setMyReservations((current) => current.map((reservation) => reservation.id === reservationId ? { ...reservation, status: "CANCELLED" } : reservation));
      setSavedReservations((current) => current.map((reservation) => reservation.id === reservationId ? { ...reservation, status: "CANCELLED" } : reservation));
      const cancelMessage = "Tu reserva se canceló correctamente. Puedes volver a reservar cuando quieras.";
      setReminderMessage(cancelMessage);
      setFeedback({ type: "success", message: cancelMessage });
      await showDesktopNotification("Reserva cancelada", cancelMessage);
      await loadMyReservations();
      setProfileError("");
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo cancelar la reserva." });
      setProfileError(err.message || "No se pudo cancelar la reserva");
    } finally {
      setCancelingReservationId(null);
    }
  };

  const handleRebookReservation = (reservation) => {
    if (!reservation) return;
    const nextDate = reservation.date || (reservation.startTime ? new Date(reservation.startTime).toISOString().slice(0, 10) : date);
    const nextTime = reservation.time || (reservation.startTime ? new Date(reservation.startTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : time);
    const nextEndTime = reservation.endTime || addMinutesToTime(nextTime, 90);

    setReservationToReschedule(reservation);
    setDate(nextDate);
    setTime(nextTime);
    setEndTime(nextEndTime);
    setGuests(Math.max(1, reservation.guests || guests));
    setSelectedTable(null);
    setStep(1);
    setProfileError("");
    setAvailabilityMessage("Se preparó la reprogramación de tu reserva. Elige una mesa nueva y confirma el cambio.");
    setReminderMessage(`Se preparó la reprogramación para ${nextDate} a las ${nextTime}.`);
  };

  const combinedReservations = [...myReservations, ...savedReservations.filter((item) => !myReservations.some((existing) => existing.id === item.id))];
  const sortedReservations = [...combinedReservations].sort((a, b) => {
    const startA = getReservationStartTime(a);
    const startB = getReservationStartTime(b);
    if (!startA && !startB) return 0;
    if (!startA) return 1;
    if (!startB) return -1;
    return startA.getTime() - startB.getTime();
  });
  const upcomingReservations = sortedReservations.filter((reservation) => {
    const startTime = getReservationStartTime(reservation);
    return Boolean(startTime && isUpcomingReservation(startTime) && !["CANCELLED", "LATE_CANCELLED"].includes(reservation?.status || ""));
  });
  const recentReservations = sortedReservations.filter((reservation) => {
    const startTime = getReservationStartTime(reservation);
    return Boolean(startTime && !isUpcomingReservation(startTime));
  });

  if (step === 3) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: APP_CARD, borderRadius: 24, padding: "48px 40px", textAlign: "center", maxWidth: 480, width: "100%", boxShadow: CARD_SHADOW, border: `1px solid ${APP_BORDER}` }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>¡Reserva confirmada!</h2>
          <p style={{ color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
            Tu mesa <strong>{selectedTable?.label}</strong> en <strong>{restaurant.name}</strong> quedó reservada para el <strong>{date}</strong> a las <strong>{time}</strong>.
          </p>

          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 14, padding: "16px 18px", textAlign: "left", marginBottom: 16 }}>
            <p style={{ margin: "0 0 6px", color: "#15803d", fontSize: 14 }}><strong>Reserva:</strong> {confirmationSummary?.id || "Guardada correctamente"}</p>
            <p style={{ margin: "0 0 6px", color: "#15803d", fontSize: 14 }}><strong>Horario:</strong> {time} - {endTime}</p>
            <p style={{ margin: 0, color: "#15803d", fontSize: 14 }}><strong>Personas:</strong> {guests}</p>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", textAlign: "left", marginBottom: 18 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#0f172a" }}>Seguimiento</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#475569", fontSize: 14, lineHeight: 1.6 }}>
              <li>Recibirás la confirmación por correo.</li>
              <li>Te recomendamos llegar 10 minutos antes.</li>
              <li>Tu reserva quedó guardada para seguimiento rápido con estado actualizado.</li>
            </ul>
          </div>

          <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 14, padding: "12px 14px", textAlign: "left", marginBottom: 18 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#92400e" }}>Recordatorios</p>
            <p style={{ margin: 0, color: "#78350f", fontSize: 13 }}>
              {reminderMessage || "Te enviaremos un recordatorio 1 hora antes para que no se te olvide."}
            </p>
            <button
              onClick={handleEnableReminders}
              style={{ marginTop: 10, border: "none", background: "#f59e0b", color: "white", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}
            >
              {reminderPermission === "granted" ? "Recordatorios activos" : "Activar alertas del navegador"}
            </button>
          </div>

          {savedReservations.length > 0 ? (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 14, padding: "12px 14px", textAlign: "left", marginBottom: 18 }}>
              <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#1d4ed8" }}>Última reserva guardada</p>
              <p style={{ margin: 0, color: "#1e40af", fontSize: 13 }}>
                {savedReservations[0].restaurantName} · Mesa {savedReservations[0].tableLabel} · {savedReservations[0].date} {savedReservations[0].time}
              </p>
            </div>
          ) : null}

          {(isAuthenticated || myReservations.length > 0 || savedReservations.length > 0) ? (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", textAlign: "left", marginBottom: 18 }}>
              <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#0f172a" }}>Historial y seguimiento</p>
              <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 12 }}>
                Tu historial se actualiza con estado en tiempo real para que tengas una visión más completa de tus reservas.
              </p>
              {myReservationsLoading ? (
                <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Cargando tus reservas…</p>
              ) : myReservations.length > 0 ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {myReservations.slice(0, 3).map((reservation) => (
                    <div key={reservation.id} style={{ border: "1px solid #dbeafe", borderRadius: 10, padding: "10px 12px", background: "white" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, color: "#0f172a", fontSize: 13 }}>{reservation.restaurantName}</p>
                          <p style={{ margin: "2px 0 0", color: "#475569", fontSize: 12 }}>{reservation.tableLabel ? `Mesa ${reservation.tableLabel}` : "Mesa sin asignar"}</p>
                          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 11 }}>{formatReservationDateTime(reservation.startTime)}</p>
                        </div>
                        <span style={{ fontSize: 12, color: reservation.status === "CONFIRMED" ? "#15803d" : "#b45309", fontWeight: 700 }}>
                          {reservation.status === "CONFIRMED" ? "Confirmada" : reservation.status === "CANCELLED" ? "Cancelada" : reservation.status}
                        </span>
                      </div>
                      {reservation.status === "CONFIRMED" && isUpcomingReservation(reservation.startTime) ? (
                        <button
                          onClick={() => handleCancelReservation(reservation.id)}
                          disabled={cancelingReservationId === reservation.id}
                          style={{ marginTop: 8, border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}
                        >
                          {cancelingReservationId === reservation.id ? "Cancelando…" : "Cancelar"}
                        </button>
                      ) : null}
                      {reservation.status === "CONFIRMED" && !isUpcomingReservation(reservation.startTime) ? (
                        <span style={{ marginTop: 8, display: "inline-block", fontSize: 12, color: "#64748b" }}>
                          Se registró como reserva pasada.
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Aún no tienes reservas registradas en tu cuenta.</p>
              )}
            </div>
          ) : null}

          <button onClick={onBack} style={{ background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "14px 32px", fontSize: 16, fontWeight: 600, cursor: "pointer", width: "100%" }}>
            Buscar otro restaurante
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      {/* Header */}
      <div style={{ background: "#0f172a", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1 }}>
          <p style={{ color: "#94a3b8", margin: 0, fontSize: 12 }}>Reservando en</p>
          <p style={{ color: "white", margin: 0, fontWeight: 700, fontSize: 18 }}>{restaurant.name}</p>
        </div>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setProfileMenuOpen((value) => !value)}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "2px solid #ffffff",
              background: "linear-gradient(135deg, #f8fafc, #cbd5e1)",
              color: "#0f172a",
              cursor: "pointer",
              fontSize: 18,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.18)",
            }}
            aria-label="Abrir perfil"
          >
            👤
          </button>
          {profileMenuOpen ? (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: APP_CARD, borderRadius: 14, border: `1px solid ${APP_BORDER}`, minWidth: 220, boxShadow: CARD_SHADOW, zIndex: 20 }}>
              {isAuthenticated ? (
                <>
                  <div style={{ padding: "12px 14px", borderBottom: `1px solid ${APP_BORDER}` }}>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{user?.displayName || user?.username || "Usuario"}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{user?.username || email || "Tu cuenta"}</div>
                  </div>
                  <button onClick={handleLogout} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "12px 14px", cursor: "pointer", color: "#dc2626", fontWeight: 700 }}>
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setAuthMode("login"); setAuthError(""); setProfileMenuOpen(false); onBack(); }} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "12px 14px", cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>
                    Iniciar sesión
                  </button>
                  <button onClick={() => { setAuthMode("register"); setAuthError(""); setProfileMenuOpen(false); onBack(); }} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "12px 14px", cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>
                    Crear cuenta
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(0,380px)", gap: 28, alignItems: "start" }}>
          {/* Left: Floor Plan */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>Elige tu mesa</h2>
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Haz clic en una mesa verde para elegirla según la fecha, hora y número de personas.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {Array.from(new Set((restaurant?.tables || []).map((table) => Number(table.floor || 1)))).sort((a, b) => a - b).map((floorNumber) => (
                <button
                  key={floorNumber}
                  onClick={() => setActiveFloor(floorNumber)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 14,
                    border: activeFloor === floorNumber ? "2px solid #0f172a" : "1px solid #e2e8f0",
                    background: activeFloor === floorNumber ? "#0f172a" : "white",
                    color: activeFloor === floorNumber ? "white" : "#334155",
                    fontWeight: 700,
                    cursor: "pointer",
                    minWidth: 88,
                  }}
                >
                  {floorNumber === 1 ? "Piso 1" : `Piso ${floorNumber}`}
                </button>
              ))}
            </div>
          </div>
          <FloorPlan
            tables={displayTables.filter((table) => Number(table.floor || 1) === Number(activeFloor))}
            onTableClick={(t) => setSelectedTable(t)}
            selectedTableId={selectedTable?.id}
            layoutElements={(restaurant.layoutElements || []).filter((element) => {
              if (element.type === "floor") return Number(element.level || 1) === Number(activeFloor);
              return Number(element.floor || 1) === Number(activeFloor);
            })}
            floor={activeFloor}
          />

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ padding: "8px 12px", borderRadius: 999, background: selectedTable ? "#ecfdf5" : "#f8fafc", border: `1px solid ${selectedTable ? "#86efac" : "#e2e8f0"}` }}>
              <span style={{ fontWeight: 700, color: selectedTable ? "#166534" : "#64748b" }}>
                {selectedTable ? `Mesa seleccionada: ${selectedTable.label}` : "Aún no has seleccionado ninguna mesa"}
              </span>
            </div>
            {selectedTable ? (
              <span style={{ fontSize: 12, color: "#475569" }}>
                {selectedTable.seats} personas · {selectedTable.floor || 1} · Disponible
              </span>
            ) : null}
          </div>

          {selectedTable && (
            <div style={{ marginTop: 16, background: "linear-gradient(135deg, #eff6ff, #f8fbff)", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 24px rgba(37, 99, 235, 0.08)" }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: "#1e40af" }}>Mesa {selectedTable.label} seleccionada</p>
                <p style={{ margin: 0, color: "#3b82f6", fontSize: 13 }}>
                  Hasta {selectedTable.seats} persona{selectedTable.seats === 1 ? "" : "s"} · {selectedTable.status === "available" ? "Disponible para reservar" : "Lista para revisar"}
                </p>
              </div>
            </div>
          )}

          {(loadingReservations || reservationLoadError) ? (
            <div style={{ marginTop: 16, background: reservationLoadError ? "#fef2f2" : "#eff6ff", border: `1px solid ${reservationLoadError ? "#fecaca" : "#bfdbfe"}`, borderRadius: 14, padding: "14px 16px" }}>
              <p style={{ margin: 0, fontWeight: 700, color: reservationLoadError ? "#991b1b" : "#1d4ed8", fontSize: 14 }}>
                {loadingReservations ? "Actualizando disponibilidad..." : "No se pudo cargar la disponibilidad"}
              </p>
              <p style={{ margin: "8px 0 0", color: reservationLoadError ? "#7f1d1d" : "#1e3a8a", fontSize: 13, lineHeight: 1.5 }}>
                {loadingReservations ? "Por favor espera mientras se cargan las mesas disponibles para la fecha seleccionada." : reservationLoadError}
              </p>
            </div>
          ) : (
            <div style={{ marginTop: 16, background: "#ecfdf5", border: "1px solid #86efac", borderRadius: 14, padding: "12px 14px" }}>
              <p style={{ margin: 0, fontWeight: 700, color: "#166534", fontSize: 14 }}>Disponibilidad actualizada</p>
              <p style={{ margin: "8px 0 0", color: "#134e4a", fontSize: 13, lineHeight: 1.5 }}>
                Los datos de mesas y horarios se están renovando automáticamente para mostrar el estado más reciente.
              </p>
            </div>
          )}

          <div style={{ marginTop: 16, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 14, padding: "12px 14px" }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#92400e" }}>Estado del cliente</p>
            <p style={{ margin: 0, color: "#78350f", fontSize: 13 }}>
              Las reservas ahora muestran si están próximas, en curso, finalizadas o canceladas para que el seguimiento sea mucho más claro.
            </p>
          </div>
        </div>

          {/* Right: Form */}
          <div style={{ background: APP_CARD, borderRadius: 18, border: `1.5px solid ${APP_BORDER}`, padding: "28px 24px", position: "sticky", top: 24, boxShadow: CARD_SHADOW }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
            {step === 2 ? "Revisa tu reserva" : "Datos de la reserva"}
          </h3>

          {feedback && step !== 3 ? (
            <div style={{ marginBottom: 14, borderRadius: 12, padding: "12px 14px", border: `1px solid ${feedback.type === "error" ? "#fecaca" : feedback.type === "success" ? "#a7f3d0" : "#bfdbfe"}`, background: feedback.type === "error" ? "#fef2f2" : feedback.type === "success" ? "#f0fdf4" : "#eff6ff", color: feedback.type === "error" ? "#991b1b" : feedback.type === "success" ? "#166534" : "#1d4ed8" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {feedback.type === "error" ? "Atención" : feedback.type === "success" ? "Confirmado" : "Información"}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{feedback.message}</div>
            </div>
          ) : null}

          {loadingReservations ? (
            <div style={{ marginBottom: 14, borderRadius: 12, padding: "10px 12px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontSize: 13, fontWeight: 700 }}>
              Comprobando disponibilidad…
            </div>
          ) : null}

          {reservationLoadError ? (
            <div style={{ marginBottom: 14, borderRadius: 12, padding: "10px 12px", border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", fontSize: 13, fontWeight: 700 }}>
              {reservationLoadError}
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div style={{ background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)", border: "1.5px solid #86efac", borderRadius: 14, padding: "16px 18px", marginBottom: 16 }}>
                <p style={{ margin: "0 0 8px", fontWeight: 800, color: "#166534" }}>Resumen de la reserva</p>
                <p style={{ margin: "0 0 6px", color: "#166534", fontSize: 14 }}><strong>Restaurante:</strong> {restaurant.name}</p>
                <p style={{ margin: "0 0 6px", color: "#166534", fontSize: 14 }}><strong>Mesa:</strong> {selectedTable?.label || "—"}</p>
                <p style={{ margin: "0 0 6px", color: "#166534", fontSize: 14 }}><strong>Fecha:</strong> {date}</p>
                <p style={{ margin: "0 0 6px", color: "#166534", fontSize: 14 }}><strong>Horario:</strong> {time} - {endTime}</p>
                <p style={{ margin: 0, color: "#166534", fontSize: 14 }}><strong>Personas:</strong> {guests}</p>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                <p style={{ margin: 0, color: "#475569", fontSize: 13 }}><strong>Cliente:</strong> {name}</p>
                <p style={{ margin: "6px 0 0", color: "#475569", fontSize: 13 }}><strong>Email:</strong> {email}</p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, background: "#e2e8f0", color: "#0f172a", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                  Editar
                </button>
                <button onClick={handleConfirm} disabled={isSubmittingReservation} style={{ flex: 1, background: isSubmittingReservation ? "#475569" : "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: isSubmittingReservation ? "not-allowed" : "pointer" }}>
                  {isSubmittingReservation ? "Confirmando..." : "Confirmar reserva"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <Label>Fecha</Label>
              <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} style={inputStyle} />

              <Label>Hora de inicio</Label>
              <input type="time" value={time} step="1800" list="reservation-times" onChange={(e) => setTime(e.target.value)} style={inputStyle} />
              <datalist id="reservation-times">
                {times.map((t) => <option key={t} value={t} />)}
              </datalist>

              <Label>Hora de fin</Label>
              <input
                type="time"
                value={endTime}
                step="1800"
                min={time}
                max={suggestedEndMax}
                list="reservation-times"
                onChange={(e) => setEndTime(e.target.value)}
                style={{ ...inputStyle, marginBottom: 4 }}
              />
              <p style={{ color: durationError ? "#dc2626" : "#64748b", fontSize: 12, margin: "4px 0 12px" }}>
                {durationError || `La reserva puede durar hasta 2 horas. Fin máximo ${suggestedEndMax}.`}
              </p>
              {selectedTable && availabilityMessage ? (
                <p style={{ color: requestedIntervalAvailable ? "#15803d" : "#b91c1c", fontSize: 13, margin: "0 0 12px" }}>
                  {availabilityMessage}
                </p>
              ) : null}

              <Label>Número de personas</Label>
              <p style={{ color: "#64748b", fontSize: 12, margin: "-4px 0 10px" }}>Elige entre 1 y 8 personas.</p>
              <input
                type="number"
                min="1"
                max="8"
                value={guests}
                onChange={(e) => handleGuestsChange(e.target.value)}
                style={{ ...inputStyle, marginBottom: 16 }}
              />

              <Label>Tu nombre</Label>
              <input placeholder="Nombre completo" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />

              <Label>Email</Label>
              <input type="email" placeholder="correo@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />

              <button
                onClick={handleReviewReservation}
                disabled={!canReviewReservation}
                style={{ width: "100%", background: canReviewReservation ? "#0f172a" : "#e2e8f0", color: canReviewReservation ? "white" : "#94a3b8", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: canReviewReservation ? "pointer" : "not-allowed", marginTop: 8, transition: "all 0.2s" }}>
                {selectedTable ? `Revisar reserva de la mesa ${selectedTable.label}` : "Selecciona una mesa"}
              </button>
            </>
          )}

          {(upcomingReservations.length > 0 || recentReservations.length > 0) ? (
            <div style={{ marginTop: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px" }}>
              <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#0f172a", fontSize: 14 }}>Historial y seguimiento</p>
              <div style={{ display: "grid", gap: 8 }}>
                {upcomingReservations.slice(0, 2).map((reservation) => {
                  const statusMeta = getReservationStatusMeta(reservation);
                  return (
                    <div key={`upcoming-${reservation.id}`} style={{ border: "1px solid #dbeafe", borderRadius: 10, padding: "10px 12px", background: "white" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, color: "#0f172a", fontSize: 13 }}>{reservation.restaurantName}</p>
                          <p style={{ margin: "2px 0 0", color: "#475569", fontSize: 12 }}>{formatReservationDateTime(getReservationStartTime(reservation))}</p>
                        </div>
                        <span style={{ fontSize: 12, color: statusMeta.tone, fontWeight: 700 }}>{statusMeta.label}</span>
                      </div>
                      <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>{statusMeta.message}</p>
                      <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 11 }}>
                        {statusMeta.state === "active" ? "La reserva ya está en desarrollo." : statusMeta.state === "finished" ? "La reserva ya fue cerrada." : statusMeta.state === "cancelled" ? "La reserva quedó cancelada." : "Reserva registrada en tu cuenta"}
                      </p>
                      <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 11 }}>
                        {reservation.createdAt ? `Creada el ${formatReservationDateTime(reservation.createdAt)}` : "Reserva registrada en tu cuenta"}
                      </p>
                      {reservation.cancellationReason ? (
                        <p style={{ margin: "4px 0 0", color: "#b45309", fontSize: 11 }}>Motivo: {reservation.cancellationReason}</p>
                      ) : null}
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        {statusMeta.canCancel ? (
                          <button onClick={() => handleCancelReservation(reservation.id)} disabled={cancelingReservationId === reservation.id} style={{ border: "none", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                            {cancelingReservationId === reservation.id ? "Cancelando…" : "Cancelar"}
                          </button>
                        ) : null}
                        {statusMeta.canRebook ? (
                          <button onClick={() => handleRebookReservation(reservation)} style={{ border: "none", background: "#e0f2fe", color: "#0369a1", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                            Reprogramar reserva
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {recentReservations.slice(0, 2).map((reservation) => {
                  const statusMeta = getReservationStatusMeta(reservation);
                  return (
                    <div key={`history-${reservation.id}`} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", background: "#f8fafc" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, color: "#0f172a", fontSize: 13 }}>{reservation.restaurantName}</p>
                          <p style={{ margin: "2px 0 0", color: "#475569", fontSize: 12 }}>{formatReservationDateTime(getReservationStartTime(reservation))}</p>
                        </div>
                        <span style={{ fontSize: 12, color: statusMeta.tone, fontWeight: 700 }}>{statusMeta.label}</span>
                      </div>
                      <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>{statusMeta.message}</p>
                      <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 11 }}>
                        {reservation.createdAt ? `Creada el ${formatReservationDateTime(reservation.createdAt)}` : "Reserva registrada en tu cuenta"}
                      </p>
                      {reservation.cancellationReason ? (
                        <p style={{ margin: "4px 0 0", color: "#b45309", fontSize: 11 }}>Motivo: {reservation.cancellationReason}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            Cancela gratis hasta 2 horas antes y revisa el estado de tus reservas desde aquí.
          </p>
          {profileError ? <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10, marginBottom: 0 }}>{profileError}</p> : null}
        </div>
        </div>
      </div>
    </div>
  );
}
