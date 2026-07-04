import React, { useEffect, useState } from "react";
import { API_BASE_URL, APP_CARD, APP_BORDER, CARD_SHADOW } from "../lib/constants.js";
import { setAccessToken, clearAccessToken, requestJson } from "../lib/api.js";
import { readClientSession, writeClientSession } from "../lib/storage.js";
import FloorPlan from "../components/FloorPlan.jsx";
import { Label, inputStyle } from "../components/FormFields.jsx";

const buildReservationWindow = (date, time) => {
  const [year, month, day] = (date || "2026-06-27").split("-").map(Number);
  const [hours, minutes] = (time || "20:00").split(":").map(Number);
  const start = new Date(year, month - 1, day, hours, minutes, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { start, end };
};

const hasTimeOverlap = (startA, endA, startB, endB) => startA < endB && startB < endA;

export default function ClientReservation({ restaurant, onBack, onConfirm }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("20:00");
  const sessionProfile = readClientSession();
  const [name, setName] = useState(sessionProfile?.displayName || "");
  const [email, setEmail] = useState(sessionProfile?.username || "");
  const [guests, setGuests] = useState(2);
  const [step, setStep] = useState(1); // 1=select table, 2=fill form, 3=confirmed
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(readClientSession()?.token));
  const [profileData, setProfileData] = useState(() => {
    const session = readClientSession();
    if (!session?.token) return null;
    return { username: session.username, displayName: session.displayName, role: session.role };
  });
  const [profileError, setProfileError] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [displayTables, setDisplayTables] = useState(() => restaurant?.tables || []);
  const [activeFloor, setActiveFloor] = useState(() => {
    const floors = Array.from(new Set((restaurant?.tables || []).map((table) => Number(table.floor || 1))));
    return floors.sort((a, b) => a - b)[0] || 1;
  });
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [reservationLoadError, setReservationLoadError] = useState("");

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
      await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" });
    } catch (err) {
      console.warn("Logout request failed", err);
    }
    clearAccessToken();
    writeClientSession(null);
    setIsAuthenticated(false);
    setProfileData(null);
    setProfileError("");
    setProfileMenuOpen(false);
    setName("");
    setEmail("");
    setAuthName("");
    setAuthEmail("");
    setAuthPassword("");
  };

  const loadProfile = async () => {
    try {
      const data = await requestJson(`${API_BASE_URL}/auth/me`);
      setProfileData(data || null);
      setProfileError("");
    } catch (err) {
      const fallbackSession = readClientSession();
      if (fallbackSession?.token) {
        setProfileData({
          username: fallbackSession.username,
          displayName: fallbackSession.displayName,
          role: fallbackSession.role,
        });
        setProfileError("");
        return;
      }
      if (err?.status === 401) {
        await handleLogout();
      } else {
        setProfileError("No se pudo cargar tu perfil");
      }
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setProfileData(null);
      setProfileError("");
      return;
    }
    const session = readClientSession();
    if (session?.token) {
      setAccessToken(session.token);
      setProfileData({
        username: session.username,
        displayName: session.displayName,
        role: session.role,
      });
      setName(session.displayName || "");
      setEmail(session.username || "");
    }
    loadProfile();
  }, [isAuthenticated]);

  useEffect(() => {
    const { start, end } = buildReservationWindow(date, time);

    const buildAvailability = (tables, reservations) => {
      const reservedTableIds = new Set(
        reservations
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

    if (!restaurant?.backendResourceId) {
      setDisplayTables(buildAvailability(restaurant?.tables || [], []));
      return;
    }

    const loadReservations = async () => {
      setLoadingReservations(true);
      setReservationLoadError("");
      try {
        const reservations = await requestJson(`${API_BASE_URL}/api/resources/${restaurant.backendResourceId}/reservations?date=${date}`);
        setDisplayTables(buildAvailability(restaurant.tables || [], reservations || []));
      } catch (err) {
        console.warn("No se pudo cargar las reservas del día:", err);
        setDisplayTables(buildAvailability(restaurant?.tables || [], []));
        setReservationLoadError("No se pudo cargar las reservas actuales");
      } finally {
        setLoadingReservations(false);
      }
    };

    loadReservations();
  }, [restaurant, date, time, guests]);

  useEffect(() => {
    if (profileData?.displayName) setName(profileData.displayName);
    if (profileData?.username) setEmail(profileData.username);
  }, [profileData?.displayName, profileData?.username]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (authMode === "register") {
        try {
          await requestJson(`${API_BASE_URL}/auth/register`, {
            method: "POST",
            body: JSON.stringify({ username: authEmail, password: authPassword, displayName: authName }),
          });
        } catch (registerErr) {
          console.warn("Registro previo falló, se intentará login", registerErr);
        }
      }

      const loginResp = await requestJson(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ username: authEmail, password: authPassword }),
      });

      const token = loginResp?.token;
      if (!token) {
        throw new Error("No se recibió un token de acceso");
      }

      const profileName = loginResp?.displayName || authName || "";
      setAccessToken(token);
      setIsAuthenticated(true);
      setName(profileName);
      setEmail(authEmail);
      writeClientSession({ token, username: authEmail, displayName: profileName, role: loginResp?.role || "USER" });
      await loadProfile();
    } catch (err) {
      setAuthError(err.message || "No se pudo iniciar sesión");
    }
  };

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

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 480, background: APP_CARD, borderRadius: 24, padding: "32px 28px", boxShadow: CARD_SHADOW, border: `1px solid ${APP_BORDER}` }}>
          <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", padding: 0, fontSize: 16, marginBottom: 18 }}>← Volver</button>
          <p style={{ margin: 0, color: "#64748b", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Acceso de cliente</p>
          <h2 style={{ margin: "8px 0 10px", color: "#0f172a", fontSize: 26, fontWeight: 800 }}>Inicia sesión para reservar</h2>
          <p style={{ margin: "0 0 20px", color: "#64748b", lineHeight: 1.5 }}>Regístrate o entra con tu cuenta para confirmar una mesa en segundos.</p>

          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {[
              { key: "login", label: "Iniciar sesión" },
              { key: "register", label: "Crear cuenta" },
            ].map((tab) => (
              <button key={tab.key} onClick={() => { setAuthMode(tab.key); setAuthError(""); }} style={{ flex: 1, borderRadius: 12, padding: "12px 14px", border: authMode === tab.key ? "1px solid #0f172a" : "1px solid #e2e8f0", background: authMode === tab.key ? "#0f172a" : "white", color: authMode === tab.key ? "white" : "#475569", cursor: "pointer", fontWeight: 700 }}>
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleAuthSubmit}>
            {authMode === "register" && (
              <>
                <Label>Tu nombre</Label>
                <input value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Nombre completo" style={inputStyle} />
              </>
            )}
            <Label>Email</Label>
            <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="correo@ejemplo.com" style={inputStyle} />
            <Label>Contraseña</Label>
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
            {authError ? <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>{authError}</p> : null}
            <button type="submit" style={{ width: "100%", background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              {authMode === "register" ? "Crear cuenta y entrar" : "Entrar"}
            </button>
          </form>
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
    if (!name || !email || !selectedTable || guests < 1 || guests > 8 || guests > selectedTable.seats) return;
    try {
      await onConfirm({
        tableId: selectedTable.id,
        date,
        time,
        name,
        email,
        guests,
        floor: selectedTable.floor || 1,
        resourceId: selectedTable.resourceId || restaurant.backendResourceId,
      });
      setStep(3);
    } catch (err) {
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
        {isAuthenticated ? (
          <div style={{ position: "relative" }}>
            <button onClick={() => setProfileMenuOpen((value) => !value)} style={{ background: "white", color: "#0f172a", border: "none", borderRadius: 999, padding: "10px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              👤 {profileData?.displayName || profileData?.username || "Perfil"}
            </button>
            {profileMenuOpen ? (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: APP_CARD, borderRadius: 14, border: `1px solid ${APP_BORDER}`, minWidth: 220, boxShadow: CARD_SHADOW, zIndex: 20 }}>
                <div style={{ padding: "12px 14px", borderBottom: `1px solid ${APP_BORDER}` }}>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>{profileData?.displayName || profileData?.username || "Usuario"}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{profileData?.username || email || "Tu cuenta"}</div>
                </div>
                <button onClick={handleLogout} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "12px 14px", cursor: "pointer", color: "#dc2626", fontWeight: 700 }}>
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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

          <Label>Hora</Label>
          <input type="time" value={time} step="1800" list="reservation-times" onChange={(e) => setTime(e.target.value)} style={inputStyle} />
          <datalist id="reservation-times">
            {times.map((t) => <option key={t} value={t} />)}
          </datalist>

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
            disabled={!selectedTable || !name || !email || guests < 1 || guests > 8 || (selectedTable?.seats && guests > selectedTable.seats) || selectedTable?.status !== "available"}
            style={{ width: "100%", background: selectedTable && name && email && guests >= 1 && guests <= 8 && (!selectedTable?.seats || guests <= selectedTable.seats) && selectedTable?.status === "available" ? "#0f172a" : "#e2e8f0", color: selectedTable && name && email && guests >= 1 && guests <= 8 && (!selectedTable?.seats || guests <= selectedTable.seats) && selectedTable?.status === "available" ? "white" : "#94a3b8", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: selectedTable && name && email && guests >= 1 && guests <= 8 && (!selectedTable?.seats || guests <= selectedTable.seats) && selectedTable?.status === "available" ? "pointer" : "not-allowed", marginTop: 8, transition: "all 0.2s" }}>
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
