import React, { useEffect, useState } from "react";
import { API_BASE_URL, APP_CARD, APP_BORDER, CARD_SHADOW } from "../lib/constants.js";
import { requestJson } from "../lib/api.js";
import FloorPlan from "../components/FloorPlan.jsx";
import { Label, inputStyle } from "../components/FormFields.jsx";
import { useAuth } from "../context/AuthContext.jsx";

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
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [requestedIntervalAvailable, setRequestedIntervalAvailable] = useState(true);

  const buildAvailability = (tables, reservations) => {
    const { start, end } = buildReservationWindow(date, time);
    const reservedTableIds = new Set(
      (reservations || [])
        .filter((res) => {
          if (!res?.tableId) return false;
          const reservationStart = res?.startTime ? new Date(res.startTime) : null;
          const reservationEnd = res?.endTime ? new Date(res.endTime) : null;
          return reservationStart && reservationEnd && hasTimeOverlap(reservationStart, reservationEnd, start, end);
        })
        .map((res) => res.tableId)
    );

    return (tables || []).map((table) => {
      const seatsFit = Number(table.seats || 0) >= Math.max(1, Number(guests || 1));
      const isBooked = reservedTableIds.has(table.id);
      return {
        ...table,
        status: isBooked ? "reserved" : seatsFit ? "available" : "occupied",
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

  const loadAvailability = async () => {
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
      setLoadingReservations(false);
    }
  };

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
    loadAvailability();
  }, [restaurant, date, time, endTime, guests]);

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

  const handleGuestsChange = (value) => {
    const parsedValue = Number(value);
    if (Number.isNaN(parsedValue)) {
      setGuests(1);
      return;
    }
    const clampedValue = Math.min(8, Math.max(1, parsedValue));
    setGuests(clampedValue);
  };

  const handleConfirm = async () => {
    if (!name || !email || !selectedTable || guests < 1 || guests > 8 || guests > selectedTable.seats || durationError || !requestedIntervalAvailable) return;
    try {
      await onConfirm({
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
      setStep(3);
    } catch (err) {
      await loadAvailability();
      setProfileError(err.message || "No se pudo confirmar la reserva");
    }
  };

  if (step === 3) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: APP_CARD, borderRadius: 24, padding: "48px 40px", textAlign: "center", maxWidth: 440, width: "100%", boxShadow: CARD_SHADOW, border: `1px solid ${APP_BORDER}` }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>¡Reserva confirmada!</h2>
          <p style={{ color: "#64748b", marginBottom: 24, lineHeight: 1.6 }}>
            Tu mesa <strong>{selectedTable.label}</strong> en <strong>{restaurant.name}</strong> está reservada para el{" "}
            <strong>{date}</strong> a las <strong>{time}</strong>.
          </p>
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12, padding: "16px 20px", textAlign: "left", marginBottom: 28 }}>
            <p style={{ margin: 0, color: "#15803d", fontSize: 14 }}>📧 Confirmación enviada a <strong>{email}</strong></p>
          </div>
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
        </div>

          {/* Right: Form */}
          <div style={{ background: APP_CARD, borderRadius: 18, border: `1.5px solid ${APP_BORDER}`, padding: "28px 24px", position: "sticky", top: 24, boxShadow: CARD_SHADOW }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Datos de la reserva</h3>

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
            onClick={handleConfirm}
            disabled={!selectedTable || !name || !email || guests < 1 || guests > 8 || (selectedTable?.seats && guests > selectedTable.seats) || selectedTable?.status !== "available" || !canConfirmReservation}
            style={{ width: "100%", background: selectedTable && name && email && guests >= 1 && guests <= 8 && (!selectedTable?.seats || guests <= selectedTable.seats) && selectedTable?.status === "available" && canConfirmReservation ? "#0f172a" : "#e2e8f0", color: selectedTable && name && email && guests >= 1 && guests <= 8 && (!selectedTable?.seats || guests <= selectedTable.seats) && selectedTable?.status === "available" && canConfirmReservation ? "white" : "#94a3b8", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: selectedTable && name && email && guests >= 1 && guests <= 8 && (!selectedTable?.seats || guests <= selectedTable.seats) && selectedTable?.status === "available" && canConfirmReservation ? "pointer" : "not-allowed", marginTop: 8, transition: "all 0.2s" }}>
            {selectedTable ? `Reservar mesa ${selectedTable.label}` : "Selecciona una mesa"}
          </button>

          <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            Cancela gratis hasta 2 horas antes
          </p>
          {profileError ? <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10, marginBottom: 0 }}>{profileError}</p> : null}
        </div>
        </div>
      </div>
    </div>
  );
}
