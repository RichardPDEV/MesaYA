import React, { useEffect, useState, useCallback, useRef } from "react";

// ─── MOCK DATA ───────────────────────────────────────────────────────────────
const INITIAL_RESTAURANTS = [
  {
    id: 1,
    name: "La Terrazza",
    cuisine: "Italiana",
    address: "Calle Gran Vía 42, Madrid",
    phone: "+34 91 234 5678",
    description: "Auténtica cocina italiana con vistas a la ciudad. Ambiente íntimo y elegante.",
    image: "🍝",
    tables: [
      { id: "T1", x: 80, y: 80, seats: 2, status: "available", label: "T1" },
      { id: "T2", x: 220, y: 80, seats: 4, status: "occupied", label: "T2" },
      { id: "T3", x: 360, y: 80, seats: 2, status: "reserved", label: "T3" },
      { id: "T4", x: 80, y: 220, seats: 6, status: "available", label: "T4" },
      { id: "T5", x: 260, y: 200, seats: 4, status: "available", label: "T5" },
      { id: "T6", x: 400, y: 220, seats: 2, status: "available", label: "T6" },
    ],
    openTime: "13:00",
    closeTime: "23:00",
    reservations: [
      { id: "R1", tableId: "T2", date: "2026-06-26", time: "20:00", name: "García Familia", guests: 4, status: "confirmed" },
      { id: "R2", tableId: "T3", date: "2026-06-26", time: "21:00", name: "Martínez", guests: 2, status: "confirmed" },
    ],
  },
  {
    id: 2,
    name: "El Rincón del Mar",
    cuisine: "Mariscos",
    address: "Paseo Marítimo 15, Barcelona",
    phone: "+34 93 456 7890",
    description: "Los mejores mariscos frescos del Mediterráneo. Terraza con vista al mar.",
    image: "🦞",
    tables: [
      { id: "T1", x: 80, y: 80, seats: 4, status: "available", label: "T1" },
      { id: "T2", x: 240, y: 80, seats: 6, status: "available", label: "T2" },
      { id: "T3", x: 400, y: 80, seats: 2, status: "reserved", label: "T3" },
      { id: "T4", x: 160, y: 220, seats: 4, status: "available", label: "T4" },
      { id: "T5", x: 320, y: 220, seats: 4, status: "available", label: "T5" },
    ],
    openTime: "12:00",
    closeTime: "00:00",
    reservations: [
      { id: "R1", tableId: "T3", date: "2026-06-26", time: "19:00", name: "López", guests: 2, status: "confirmed" },
    ],
  },
];

// ─── COLOUR & STYLE HELPERS ──────────────────────────────────────────────────
const TABLE_COLORS = {
  available: { bg: "#dcfce7", border: "#16a34a", text: "#15803d", label: "Disponible" },
  occupied:  { bg: "#fee2e2", border: "#dc2626", text: "#b91c1c", label: "Ocupada" },
  reserved:  { bg: "#fef9c3", border: "#ca8a04", text: "#a16207", label: "Reservada" },
};

const tw = (...cls) => cls.filter(Boolean).join(" ");

const APP_SURFACE = "#f8fafc";
const APP_CARD = "#ffffff";
const APP_TEXT = "#0f172a";
const APP_MUTED = "#64748b";
const APP_BORDER = "#e2e8f0";
const APP_ACCENT = "#f59e0b";
const CARD_SHADOW = "0 16px 40px rgba(15, 23, 42, 0.08)";
const CARD_SHADOW_HOVER = "0 24px 56px rgba(15, 23, 42, 0.12)";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const SEED_STORAGE_KEY = "mesaYa-backend-seed";
const RESTAURANT_ACCOUNTS_KEY = "mesaYa-restaurant-accounts";
const REGISTERED_RESTAURANTS_KEY = "mesaYa-registered-restaurants";
const RESTAURANT_SESSION_KEY = "mesaYa-restaurant-session";
const SAVE_QUEUE_KEY = "mesaYa-save-queue";

function readJsonStorage(key, defaultValue) {
  if (typeof window === "undefined") return defaultValue;
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue));
  } catch {
    return defaultValue;
  }
}

// In-memory access token; refresh token is stored as httpOnly cookie by the server.
let ACCESS_TOKEN = null;
function setAccessToken(token) { ACCESS_TOKEN = token; }
function clearAccessToken() { ACCESS_TOKEN = null; }

function writeJsonStorage(key, value) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function readAccounts() {
  return readJsonStorage(RESTAURANT_ACCOUNTS_KEY, []);
}

function writeAccounts(accounts) {
  writeJsonStorage(RESTAURANT_ACCOUNTS_KEY, accounts);
}

function readRegisteredRestaurants() {
  return readJsonStorage(REGISTERED_RESTAURANTS_KEY, []);
}

function writeRegisteredRestaurants(restaurants) {
  writeJsonStorage(REGISTERED_RESTAURANTS_KEY, restaurants);
}

function readRestaurantSession() {
  return readJsonStorage(RESTAURANT_SESSION_KEY, null);
}

function writeRestaurantSession(session) {
  writeJsonStorage(RESTAURANT_SESSION_KEY, session);
}

async function requestJson(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (ACCESS_TOKEN) headers["Authorization"] = `Bearer ${ACCESS_TOKEN}`;
  const response = await fetch(url, {
    headers,
    credentials: 'include',
    ...options,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    // If unauthorized, try refreshing once
    if (response.status === 401 && url.indexOf('/auth/refresh') === -1) {
      try {
        const refreshResp = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (refreshResp.ok) {
          const text2 = await refreshResp.text();
          let payload2 = null;
          try { payload2 = JSON.parse(text2); } catch { payload2 = text2; }
          ACCESS_TOKEN = payload2?.token || ACCESS_TOKEN;
          // retry original
          return await requestJson(url, options);
        }
      } catch (refreshErr) {
        // ignore
      }
    }
    const err = new Error(payload?.message || `Request failed with status ${response.status}`);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

function readSeedStorage() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SEED_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSeedStorage(seed) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SEED_STORAGE_KEY, JSON.stringify(seed));
}

function readSaveQueue() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeSaveQueue(q) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(q));
}

function enqueueSaveItem(item) {
  const q = readSaveQueue();
  q.push(item);
  writeSaveQueue(q);
}

function removeSaveItemAt(index) {
  const q = readSaveQueue();
  if (index < 0 || index >= q.length) return;
  q.splice(index, 1);
  writeSaveQueue(q);
}

function createLayoutElement(type, x, y, floor = 1, customLabel = null) {
  const base = {
    id: `EL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    x,
    y,
    floor,
  };

  switch (type) {
    case "door":
      return { ...base, width: 56, height: 24, label: customLabel || "Puerta" };
    case "window":
      return { ...base, width: 70, height: 24, label: customLabel || "Ventana" };
    case "stairs":
      return { ...base, width: 64, height: 64, label: customLabel || "Escaleras" };
    case "floor":
      return { ...base, width: 180, height: 100, level: 2, label: customLabel || "Piso 2" };
    default:
      return base;
  }
}

async function fetchBusiness(businessId) {
  try {
    return await requestJson(`${API_BASE_URL}/v1/businesses/${businessId}`);
  } catch (err) {
    if (err?.status === 404 || err?.payload?.code === "NOT_FOUND") {
      return null;
    }
    throw err;
  }
}

async function ensureBackendSeed(restaurant) {
  const seed = readSeedStorage();
  const existing = seed[restaurant.id];

  const validateExistingSeed = async (candidate) => {
    if (!candidate?.businessId) return null;
    const existingBusiness = await fetchBusiness(candidate.businessId);
    if (existingBusiness) {
      return {
        businessId: candidate.businessId,
        resourceId: candidate.resourceId,
      };
    }
    return null;
  };

  const validatedExisting = await validateExistingSeed(existing);
  if (validatedExisting) {
    return validatedExisting;
  }

  const validatedBackendIds = await validateExistingSeed({ businessId: restaurant.backendBusinessId, resourceId: restaurant.backendResourceId });
  if (validatedBackendIds) {
    const saved = { businessId: restaurant.backendBusinessId, resourceId: restaurant.backendResourceId };
    writeSeedStorage({ ...seed, [restaurant.id]: saved });
    return saved;
  }

  if (existing) {
    delete seed[restaurant.id];
    writeSeedStorage(seed);
  }

  // Try to create business + resource with simple retry logic for transient errors
  let business = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      business = await requestJson(`${API_BASE_URL}/v1/businesses`, {
        method: "POST",
        body: JSON.stringify({
          name: restaurant.name,
          type: "RESTAURANT",
          cuisine: restaurant.cuisine,
          address: restaurant.address,
          phone: restaurant.phone,
          description: restaurant.description,
          tableLayoutJson: restaurant.tables.length || (restaurant.layoutElements || []).length
            ? JSON.stringify({ tables: restaurant.tables, layoutElements: restaurant.layoutElements || [] })
            : null,
        }),
      });
      break;
    } catch (err) {
      console.warn(`create business attempt ${attempt} failed:`, err);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, attempt * 300));
    }
  }

  let resource = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      resource = await requestJson(`${API_BASE_URL}/v1/businesses/${business.id}/resources`, {
        method: "POST",
        body: JSON.stringify({
          businessId: business.id,
          name: `${restaurant.name} mesa`,
          capacity: Math.max(...restaurant.tables.map((table) => table.seats), 2),
        }),
      });
      break;
    } catch (err) {
      console.warn(`create resource attempt ${attempt} failed:`, err);
      if (attempt === 3) {
        const nextSeedPartial = { ...seed, [restaurant.id]: { businessId: business.id } };
        writeSeedStorage(nextSeedPartial);
        return nextSeedPartial[restaurant.id];
      }
      await new Promise(r => setTimeout(r, attempt * 300));
    }
  }

  const nextSeed = { ...seed, [restaurant.id]: { businessId: business.id, resourceId: resource?.id } };
  writeSeedStorage(nextSeed);
  return nextSeed[restaurant.id];
}

async function loadBusinessProfile(restaurant) {
  const businessId = restaurant.backendBusinessId || restaurant.businessId;
  if (!businessId) return restaurant;

  try {
    const backend = await requestJson(`${API_BASE_URL}/v1/businesses/${businessId}`);
    let tables = restaurant.tables;
    let layoutElements = restaurant.layoutElements || [];
    if (backend.tableLayoutJson) {
      try {
        const parsed = JSON.parse(backend.tableLayoutJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          tables = parsed.tables || restaurant.tables;
          layoutElements = parsed.layoutElements || restaurant.layoutElements || [];
        } else {
          tables = parsed || restaurant.tables;
        }
      } catch {
        tables = restaurant.tables;
      }
    }
    return {
      ...restaurant,
      backendBusinessId: backend.id,
      backendResourceId: restaurant.backendResourceId || restaurant.resourceId,
      name: backend.name || restaurant.name,
      cuisine: backend.cuisine || restaurant.cuisine,
      address: backend.address || restaurant.address,
      phone: backend.phone || restaurant.phone,
      description: backend.description || restaurant.description,
      tables,
      layoutElements,
    };
  } catch {
    return restaurant;
  }
}

async function persistRestaurantProfile(restaurant) {
  const backend = await ensureBackendSeed(restaurant);
  let businessId = backend.businessId || restaurant.backendBusinessId || restaurant.businessId;
  if (!businessId) {
    throw new Error("El restaurante no tiene businessId para persistir en el backend");
  }

  // Retry PUT for transient failures
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await requestJson(`${API_BASE_URL}/v1/businesses/${businessId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: restaurant.name,
          type: "RESTAURANT",
          cuisine: restaurant.cuisine,
          address: restaurant.address,
          phone: restaurant.phone,
          description: restaurant.description,
          tableLayoutJson: JSON.stringify({ tables: restaurant.tables, layoutElements: restaurant.layoutElements || [] }),
        }),
      });
    } catch (err) {
      lastErr = err;
      console.warn(`persist attempt ${attempt} failed:`, err);

      // If backend reports that the Business id does not exist, clear local seed
      // for this restaurant and force re-seeding (create business + resource),
      // then retry the PUT with the new id.
      const notFound = err?.status === 404 || err?.payload?.code === "NOT_FOUND";
      if (notFound) {
        try {
          const seed = readSeedStorage();
          if (seed[restaurant.id]) {
            delete seed[restaurant.id];
            writeSeedStorage(seed);
            console.info("Seed cleared for restaurant", restaurant.id, "due to NOT_FOUND; will re-seed and retry");
          }
        } catch (e) {
          console.warn("Failed to clear seed storage:", e);
        }

        try {
          // Recreate business/resource and update businessId for the next attempt
          const recreated = await ensureBackendSeed(restaurant);
          businessId = recreated.businessId || restaurant.backendBusinessId || restaurant.businessId;
          await new Promise(r => setTimeout(r, 200));
          continue;
        } catch (reseedErr) {
          console.warn("Re-seeding failed:", reseedErr);
        }
      }

      if (attempt === 3) throw lastErr;
      await new Promise(r => setTimeout(r, attempt * 300));
    }
  }
}

async function mapRestaurantToBackend(restaurant) {
  const backend = await ensureBackendSeed(restaurant);
  const normalized = normalizeRestaurantLayout(restaurant);
  const mapped = {
    ...normalized,
    backendBusinessId: backend.businessId,
    backendResourceId: backend.resourceId,
    tables: normalized.tables.map((table, index) => ({
      ...table,
      resourceId: backend.resourceId,
      x: table.x || 80 + index * 70,
      y: table.y || 90 + (index % 3) * 70,
    })),
  };
  return loadBusinessProfile(mapped);
}

function buildIsoDateTime(date, time) {
  const [hour, minute] = time.split(":").map(Number);
  const base = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  return base.toISOString();
}

function getEndTimeFromStart(startIso, hours = 2) {
  const end = new Date(startIso);
  end.setHours(end.getHours() + hours);
  return end.toISOString();
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function Badge({ status }) {
  const c = TABLE_COLORS[status];
  return (
    <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
      {c.label}
    </span>
  );
}

// ── Floor Plan (SVG interactive) ─────────────────────────────────────────────
function FloorPlan({ tables, onTableClick, selectedTableId, editable = false, layoutElements = [], floor = null, showLegend = true, title = null, showOnlyTables = false, statusFilter = null }) {
  const getSize = (seats) => seats <= 2 ? 48 : seats <= 4 ? 60 : 72;
  const visibleTables = (tables || []).filter((table) => floor === null || (table.floor || 1) === floor);
  const visibleLayoutElements = (layoutElements || []).filter((element) => {
    if (floor === null) return true;
    if (element.type === "floor") return (element.level || 1) === floor;
    return (element.floor || 1) === floor;
  });

  return (
    <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 16, overflow: "hidden", position: "relative" }}>
      {/* Room decoration */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, #e2e8f0 1px, transparent 1px)", backgroundSize: "32px 32px", opacity: 0.4 }} />
      <svg width="100%" viewBox="0 0 540 360" style={{ display: "block", cursor: editable ? "default" : "pointer" }}>
        {/* Room labels */}
        <text x="20" y="24" fontSize="11" fill="#94a3b8" fontWeight="600" letterSpacing="1">{title || "PLANO DEL RESTAURANTE"}</text>
        <rect x="0" y="0" width="540" height="360" rx="0" fill="transparent" />

        {!showOnlyTables && visibleLayoutElements.map((element) => {
          const color = element.type === "door" ? "#34d399" : element.type === "window" ? "#60a5fa" : element.type === "stairs" ? "#f59e0b" : "#cbd5e1";
          if (element.type === "floor") {
            return (
              <g key={element.id}>
                <rect x={element.x - (element.width || 140) / 2} y={element.y - (element.height || 90) / 2} width={element.width || 140} height={element.height || 90} rx={16} fill="#f8fafc" stroke="#94a3b8" strokeDasharray="6 4" />
                <text x={element.x} y={element.y - 3} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#475569">{element.label || "Piso superior"}</text>
                <text x={element.x} y={element.y + 14} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">{element.level > 1 ? "Piso 2" : "Piso 1"}</text>
              </g>
            );
          }
          if (element.type === "stairs") {
            return (
              <g key={element.id}>
                <rect x={element.x - 30} y={element.y - 32} width="60" height="64" rx="12" fill="#fff7ed" stroke={color} strokeWidth="2" />
                <path d={`M ${element.x - 20} ${element.y + 20} L ${element.x + 20} ${element.y + 20} L ${element.x + 20} ${element.y - 10} L ${element.x - 5} ${element.y - 10} L ${element.x - 5} ${element.y + 5} L ${element.x - 20} ${element.y + 5} Z`} fill={color} opacity="0.9" />
                <text x={element.x} y={element.y + 42} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="#92400e">Escaleras</text>
              </g>
            );
          }
          return (
            <g key={element.id}>
              <rect x={element.x - (element.width || 52) / 2} y={element.y - (element.height || 22) / 2} width={element.width || 52} height={element.height || 22} rx={10} fill={element.type === "window" ? "#eff6ff" : "#f0fdf4"} stroke={color} strokeWidth="2" />
              <text x={element.x} y={element.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill={color}>{element.label || (element.type === "door" ? "Puerta" : "Ventana")}</text>
            </g>
          );
        })}

        {visibleTables.map((table) => {
          const size = getSize(table.seats);
          const col = TABLE_COLORS[table.status];
          const isSelected = selectedTableId === table.id;
          const dimmed = statusFilter && table.status !== statusFilter;
          const cx = table.x;
          const cy = table.y;

          return (
            <g key={table.id} onClick={() => onTableClick && onTableClick(table)} style={{ cursor: "pointer", opacity: dimmed ? 0.35 : 1 }}>
              {/* Shadow */}
              <rect x={cx - size / 2 + 3} y={cy - size / 2 + 3} width={size} height={size} rx={table.seats <= 2 ? size / 2 : 10}
                fill="#00000022" />
              {/* Table body */}
              <rect
                x={cx - size / 2} y={cy - size / 2} width={size} height={size}
                rx={table.seats <= 2 ? size / 2 : 10}
                fill={col.bg}
                stroke={isSelected ? "#6366f1" : col.border}
                strokeWidth={isSelected ? 3 : 1.5}
              />
              {/* Chairs */}
              {Array.from({ length: table.seats }).map((_, i) => {
                const angle = (i / table.seats) * 2 * Math.PI - Math.PI / 2;
                const r = size / 2 + 12;
                const cx2 = cx + r * Math.cos(angle);
                const cy2 = cy + r * Math.sin(angle);
                return <circle key={i} cx={cx2} cy={cy2} r={6} fill="#e2e8f0" stroke={col.border} strokeWidth={1} />;
              })}
              {/* Label */}
              <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill={col.text}>{table.label}</text>
              <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill={col.text}>{table.seats}p</text>
              <rect x={cx - 20} y={cy + 20} width="40" height="12" rx="6" fill="#0f172a" opacity="0.8" />
              <text x={cx} y={cy + 28} textAnchor="middle" fontSize="9" fontWeight="700" fill="white">{Number(table.floor || 1) > 1 ? `P${Number(table.floor || 1)}` : "P1"}</text>
            </g>
          );
        })}
      </svg>

      {showLegend && !showOnlyTables && (
        <div style={{ display: "flex", gap: 16, padding: "10px 16px", borderTop: "1px solid #e2e8f0", background: "white", flexWrap: "wrap" }}>
          {Object.entries(TABLE_COLORS).map(([key, val]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: val.bg, border: `1.5px solid ${val.border}` }} />
              <span style={{ fontSize: 12, color: "#64748b" }}>{val.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error en la app:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "white", padding: 24 }}>
          <div style={{ maxWidth: 480, width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: "32px 28px", textAlign: "center" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 24 }}>Algo no salió como esperábamos</h2>
            <p style={{ margin: "0 0 18px", color: "#cbd5e1", lineHeight: 1.6 }}>
              La aplicación encontró un error inesperado. Puedes recargar la página para intentarlo de nuevo.
            </p>
            <button onClick={() => window.location.reload()} style={{ background: "#f59e0b", color: "#111827", border: "none", borderRadius: 999, padding: "12px 20px", fontWeight: 700, cursor: "pointer" }}>
              Recargar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── VIEWS ───────────────────────────────────────────────────────────────────

// ── 1. Landing Page ──────────────────────────────────────────────────────────
function LandingPage({ onEnterClient, onEnterRestaurant }) {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(circle at top, #1e293b 0%, #0f172a 45%, #020617 100%)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 24px" }}>
        <div style={{ width: "100%", maxWidth: 1100, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 32, boxShadow: "0 24px 80px rgba(2, 6, 23, 0.35)", overflow: "hidden", backdropFilter: "blur(10px)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 0, alignItems: "stretch" }}>
            <div style={{ padding: "56px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(245, 158, 11, 0.16)", color: "#fbbf24", padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, width: "fit-content", marginBottom: 18 }}>
                ✨ Reserva en minutos, disfruta en segundos
              </div>
              <h1 style={{ fontSize: "clamp(34px, 6vw, 64px)", fontWeight: 800, color: "white", margin: "0 0 16px", lineHeight: 1.05 }}>
                Mesa<span style={{ color: "#f59e0b" }}>Ya</span>
              </h1>
              <p style={{ fontSize: "clamp(16px, 2.3vw, 22px)", color: "#cbd5e1", maxWidth: 560, margin: "0 0 30px", lineHeight: 1.6 }}>
                Descubre restaurantes, elige la mesa perfecta y confirma tu reserva con una experiencia elegante y rápida.
              </p>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
                <button
                  onClick={onEnterClient}
                  style={{ background: "linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)", color: "#111827", border: "none", borderRadius: 999, padding: "15px 28px", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 12px 30px rgba(245, 158, 11, 0.28)", transition: "transform 0.15s" }}
                  onMouseEnter={e => e.target.style.transform = "translateY(-2px)"}
                  onMouseLeave={e => e.target.style.transform = "translateY(0)"}
                >
                  Buscar restaurante
                </button>
                <button
                  onClick={onEnterRestaurant}
                  style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 999, padding: "15px 28px", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.target.style.background = "rgba(255,255,255,0.14)"; e.target.style.borderColor = "#f59e0b"; }}
                  onMouseLeave={e => { e.target.style.background = "rgba(255,255,255,0.08)"; e.target.style.borderColor = "rgba(255,255,255,0.16)"; }}
                >
                  Soy restaurante →
                </button>
              </div>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", color: "#94a3b8", fontSize: 13 }}>
                <span style={{ background: "rgba(255,255,255,0.08)", padding: "8px 12px", borderRadius: 999 }}>🗺️ Plano interactivo</span>
                <span style={{ background: "rgba(255,255,255,0.08)", padding: "8px 12px", borderRadius: 999 }}>📅 Reservas rápidas</span>
                <span style={{ background: "rgba(255,255,255,0.08)", padding: "8px 12px", borderRadius: 999 }}>🕐 Cancelación flexible</span>
              </div>
            </div>

            <div style={{ background: "linear-gradient(135deg, rgba(30,41,59,0.82), rgba(15,23,42,0.96))", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: "36px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: 380, textAlign: "left" }}>
                <p style={{ margin: 0, color: "#fbbf24", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Reserva elegante</p>
                <h3 style={{ margin: "8px 0 10px", color: "white", fontSize: 24, fontWeight: 800 }}>Disfruta de tu próxima cita</h3>
                <p style={{ margin: 0, color: "#cbd5e1", fontSize: 15, lineHeight: 1.6 }}>
                  Elige restaurante, mesa y horario en pocos pasos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,0.06)", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, padding: "24px" }}>
          {[
            { icon: "🗺️", title: "Plano en tiempo real", desc: "Ve exactamente dónde está tu mesa" },
            { icon: "📅", title: "Reserva instantánea", desc: "Confirmación inmediata por email" },
            { icon: "🕐", title: "Cancela gratis", desc: "Hasta 2 horas antes sin cargo" },
          ].map(f => (
            <div key={f.title} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 18, padding: "22px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
              <p style={{ color: "white", fontWeight: 700, margin: "0 0 4px", fontSize: 15 }}>{f.title}</p>
              <p style={{ color: "#cbd5e1", fontSize: 13, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 2. Client: Restaurant List ───────────────────────────────────────────────
function RestaurantAuth({ onRegister, onLogin, onBack, errorMessage }) {
  const [mode, setMode] = useState("login");
  const [registerForm, setRegisterForm] = useState({ name: "", cuisine: "", address: "", phone: "", email: "", password: "", description: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [status, setStatus] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setStatus("");
    try {
      // First register user on backend
      try {
        await requestJson(`${API_BASE_URL}/auth/register`, { method: 'POST', body: JSON.stringify({ username: registerForm.email, password: registerForm.password, displayName: registerForm.name }) });
      } catch (regErr) {
        // ignore, may already exist
      }
      // Login to obtain access token + refresh cookie
      const loginResp = await requestJson(`${API_BASE_URL}/auth/login`, { method: 'POST', body: JSON.stringify({ username: registerForm.email, password: registerForm.password }) });
      if (loginResp?.token) setAccessToken(loginResp.token);
      await onRegister(registerForm);
    } catch (err) {
      setStatus(err.message || "Error al registrar");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setStatus("");
    try {
      // Attempt server login first
      try {
        const resp = await requestJson(`${API_BASE_URL}/auth/login`, { method: 'POST', body: JSON.stringify({ username: loginForm.email, password: loginForm.password }) });
        if (resp?.token) setAccessToken(resp.token);
      } catch (err) {
        // fallback to local login if server not available
        console.warn('Server login failed, falling back to local accounts', err);
      }
      await onLogin(loginForm);
    } catch (err) {
      setStatus(err.message || "Email o contraseña incorrectos");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 960, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ background: APP_CARD, borderRadius: 24, padding: "36px 32px", boxShadow: CARD_SHADOW, border: `1px solid ${APP_BORDER}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>Acceso restaurante</p>
              <h2 style={{ margin: "8px 0 0", color: "#0f172a", fontSize: 28 }}>Ingresar o registrar</h2>
            </div>
            <button onClick={onBack} style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 18px", color: "#475569", cursor: "pointer" }}>← Volver</button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {[
              { key: "login", label: "Login" },
              { key: "register", label: "Registro" },
            ].map((tab) => (
              <button key={tab.key} onClick={() => { setMode(tab.key); setStatus(""); }}
                style={{ flex: 1, borderRadius: 12, padding: "12px 14px", border: mode === tab.key ? "1px solid #0f172a" : "1px solid #e2e8f0", background: mode === tab.key ? "#0f172a" : "white", color: mode === tab.key ? "white" : "#475569", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                {tab.label}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin}>
              <Label>Email</Label>
              <input value={loginForm.email} onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))} placeholder="correo@restaurante.com" style={inputStyle} />
              <Label>Contraseña</Label>
              <input type="password" value={loginForm.password} onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))} placeholder="********" style={inputStyle} />
              <button type="submit" style={{ width: "100%", background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Ingresar</button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <Label>Nombre del restaurante</Label>
              <input value={registerForm.name} onChange={(e) => setRegisterForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: El Rincón de María" style={inputStyle} />
              <Label>Tipo de cocina</Label>
              <input value={registerForm.cuisine} onChange={(e) => setRegisterForm((p) => ({ ...p, cuisine: e.target.value }))} placeholder="Ej: Española, Italiana" style={inputStyle} />
              <Label>Dirección</Label>
              <input value={registerForm.address} onChange={(e) => setRegisterForm((p) => ({ ...p, address: e.target.value }))} placeholder="Calle, número, ciudad" style={inputStyle} />
              <Label>Teléfono</Label>
              <input value={registerForm.phone} onChange={(e) => setRegisterForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+34 91 000 0000" style={inputStyle} />
              <Label>Email</Label>
              <input type="email" value={registerForm.email} onChange={(e) => setRegisterForm((p) => ({ ...p, email: e.target.value }))} placeholder="correo@restaurante.com" style={inputStyle} />
              <Label>Contraseña</Label>
              <input type="password" value={registerForm.password} onChange={(e) => setRegisterForm((p) => ({ ...p, password: e.target.value }))} placeholder="********" style={inputStyle} />
              <Label>Descripción</Label>
              <textarea value={registerForm.description} onChange={(e) => setRegisterForm((p) => ({ ...p, description: e.target.value }))} placeholder="Describe tu restaurante…" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              <button type="submit" style={{ width: "100%", background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Registrar restaurante</button>
            </form>
          )}

          {(status || errorMessage) && (
            <div style={{ marginTop: 18, padding: "12px 14px", borderRadius: 12, background: "#fee2e2", color: "#b91c1c", fontSize: 14 }}>{status || errorMessage}</div>
          )}
        </div>

        <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", borderRadius: 24, color: "white", padding: "36px 32px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: CARD_SHADOW }}>
          <div>
            <h2 style={{ margin: "0 0 14px", fontSize: 30 }}>Tu restaurante conectado</h2>
            <p style={{ color: "#cbd5e1", lineHeight: 1.8 }}>Registra tu restaurante con los datos reales y gestiona tu plano de mesas, reservas y disponibilidad desde tu panel.</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "22px 24px", border: "1px solid rgba(255,255,255,0.14)" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#f8fafc" }}>Lo que podrás hacer</p>
            <ul style={{ margin: "16px 0 0", paddingLeft: 18, color: "#cbd5e1", lineHeight: 1.8 }}>
              <li>Registrarte como restaurante</li>
              <li>Iniciar sesión con tu email</li>
              <li>Editar tu plano de mesas</li>
              <li>Ver reservas confirmadas</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientHome({ restaurants, onSelectRestaurant, onBack }) {
  const [search, setSearch] = useState("");
  const filtered = restaurants.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.cuisine.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f8fafc 0%, #fefefe 100%)" }}>
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #111827 100%)", padding: "18px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#f8fafc", fontSize: 18, cursor: "pointer", padding: "8px 12px", borderRadius: 10 }}>←</button>
        <div>
          <div style={{ color: "#f59e0b", fontWeight: 800, fontSize: 20 }}>🍽️ MesaYa</div>
          <div style={{ color: "#cbd5e1", fontSize: 12 }}>Encuentra tu próxima reserva</div>
        </div>
        <div style={{ flex: 1 }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar restaurante o cocina…"
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 999, padding: "11px 16px", color: "white", fontSize: 14, width: "min(320px, 50vw)", outline: "none" }}
        />
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Restaurantes disponibles</h2>
            <p style={{ color: "#64748b", margin: 0 }}>{filtered.length} resultados · reservas en tiempo real</p>
          </div>
          <div style={{ background: "#fff7ed", color: "#c2410c", border: "1px solid #fdba74", borderRadius: 999, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>
            ✨ Destacados esta semana
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
          {filtered.map(r => {
            const available = r.tables.filter(t => t.status === "available").length;
            return (
              <div
                key={r.id}
                onClick={() => onSelectRestaurant(r)}
                style={{ background: APP_CARD, borderRadius: 20, border: `1.5px solid ${APP_BORDER}`, overflow: "hidden", cursor: "pointer", transition: "all 0.2s", boxShadow: CARD_SHADOW }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = CARD_SHADOW_HOVER; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = CARD_SHADOW; }}
              >
                <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", padding: "28px 24px", textAlign: "center", position: "relative" }}>
                  <div style={{ fontSize: 48, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.2))" }}>{r.image}</div>
                  <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.16)", color: "white", borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 700, backdropFilter: "blur(6px)" }}>{r.cuisine}</div>
                </div>
                <div style={{ padding: "20px 20px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{r.name}</h3>
                    <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>⭐ 4.8</span>
                  </div>
                  <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 12px", lineHeight: 1.5 }}>{r.description}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "#64748b" }}>📍 {r.address.split(",")[1]?.trim()}</span>
                    <span style={{ background: available > 0 ? "#dcfce7" : "#fee2e2", color: available > 0 ? "#15803d" : "#b91c1c", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
                      {available} libres
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 3. Client: Reservation Page ──────────────────────────────────────────────
function ClientReservation({ restaurant, onBack, onConfirm }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [date, setDate] = useState("2026-06-27");
  const [time, setTime] = useState("20:00");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [guests, setGuests] = useState(2);
  const [step, setStep] = useState(1); // 1=select table, 2=fill form, 3=confirmed

  const times = [];
  for (let h = parseInt(restaurant.openTime); h <= parseInt(restaurant.closeTime) - 1; h++) {
    times.push(`${String(h).padStart(2, "0")}:00`);
    times.push(`${String(h).padStart(2, "0")}:30`);
  }

  const handleConfirm = async () => {
    if (!name || !email || !selectedTable) return;
    await onConfirm({
      tableId: selectedTable.id,
      date,
      time,
      name,
      email,
      guests,
      resourceId: selectedTable.resourceId || restaurant.backendResourceId,
    });
    setStep(3);
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
      <div style={{ background: "#0f172a", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div>
          <p style={{ color: "#94a3b8", margin: 0, fontSize: 12 }}>Reservando en</p>
          <p style={{ color: "white", margin: 0, fontWeight: 700, fontSize: 18 }}>{restaurant.name}</p>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px", display: "grid", gridTemplateColumns: "1fr minmax(0,380px)", gap: 28, alignItems: "start" }}>
        {/* Left: Floor Plan */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>Elige tu mesa</h2>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>Haz clic en una mesa disponible (verde) para seleccionarla.</p>
          <FloorPlan
            tables={restaurant.tables}
            onTableClick={(t) => t.status === "available" && setSelectedTable(t)}
            selectedTableId={selectedTable?.id}
            layoutElements={restaurant.layoutElements || []}
          />

          {selectedTable && (
            <div style={{ marginTop: 16, background: "linear-gradient(135deg, #eff6ff, #f8fbff)", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 24px rgba(37, 99, 235, 0.08)" }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: "#1e40af" }}>Mesa {selectedTable.label} seleccionada</p>
                <p style={{ margin: 0, color: "#3b82f6", fontSize: 13 }}>{selectedTable.seats} personas máximo</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Form */}
        <div style={{ background: APP_CARD, borderRadius: 18, border: `1.5px solid ${APP_BORDER}`, padding: "28px 24px", position: "sticky", top: 24, boxShadow: CARD_SHADOW }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Datos de la reserva</h3>

          <Label>Fecha</Label>
          <input type="date" value={date} min="2026-06-26" onChange={e => setDate(e.target.value)}
            style={inputStyle} />

          <Label>Hora</Label>
          <select value={time} onChange={e => setTime(e.target.value)} style={inputStyle}>
            {times.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <Label>Número de personas</Label>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button key={n} onClick={() => setGuests(n)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: guests === n ? "2px solid #0f172a" : "1.5px solid #e2e8f0", background: guests === n ? "#0f172a" : "white", color: guests === n ? "white" : "#374151", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
                {n}
              </button>
            ))}
          </div>

          <Label>Tu nombre</Label>
          <input placeholder="Nombre completo" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />

          <Label>Email</Label>
          <input type="email" placeholder="correo@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />

          <button
            onClick={handleConfirm}
            disabled={!selectedTable || !name || !email}
            style={{ width: "100%", background: selectedTable && name && email ? "#0f172a" : "#e2e8f0", color: selectedTable && name && email ? "white" : "#94a3b8", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: selectedTable && name && email ? "pointer" : "not-allowed", marginTop: 8, transition: "all 0.2s" }}>
            {selectedTable ? `Reservar mesa ${selectedTable.label}` : "Selecciona una mesa"}
          </button>

          <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            Cancela gratis hasta 2 horas antes
          </p>
        </div>
      </div>
    </div>
  );
}

const Label = ({ children }) => (
  <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#374151" }}>{children}</p>
);
const inputStyle = { width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", fontSize: 14, color: "#0f172a", marginBottom: 16, outline: "none", boxSizing: "border-box", background: "#f8fafc" };

// ── 4. Restaurant Dashboard ──────────────────────────────────────────────────
function RestaurantDashboard({ restaurants, onBack, onLogout, onSaveRestaurant, initialRestaurantId }) {
  const ownedRestaurants = initialRestaurantId ? restaurants.filter((r) => r.id === initialRestaurantId) : [];
  const [restList, setRestList] = useState(ownedRestaurants.length ? ownedRestaurants : restaurants);
  const [activeRest, setActiveRest] = useState(ownedRestaurants.find((r) => r.id === initialRestaurantId) || restaurants[0]);
  const [tab, setTab] = useState("overview"); // overview | floorplan | reservations | register

  useEffect(() => {
    const owned = initialRestaurantId ? restaurants.filter((r) => r.id === initialRestaurantId) : [];
    setRestList(owned.length ? owned : restaurants);

    const selected = owned.find((r) => r.id === initialRestaurantId) || restaurants.find((r) => r.id === activeRest?.id) || restaurants[0] || null;
    if (selected && (!activeRest || activeRest.id !== selected.id)) {
      setActiveRest(selected);
    } else if (!selected && !restaurants.some((r) => r.id === activeRest?.id)) {
      setActiveRest(restaurants[0] || null);
    }
  }, [restaurants, initialRestaurantId]);
  const [dragging, setDragging] = useState(null);
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableSeats, setNewTableSeats] = useState(4);
  const [activeFloor, setActiveFloor] = useState(1);
  const [activeElementType, setActiveElementType] = useState(null);
  const [showOnlyTables, setShowOnlyTables] = useState(false);
  const [legendFilter, setLegendFilter] = useState(null);
  const [floorCount, setFloorCount] = useState(1);
  const [floorNames, setFloorNames] = useState({ 1: "Piso principal" });
  const [selectedLayoutElementId, setSelectedLayoutElementId] = useState(null);
  const dragIntentRef = useRef(false);
  const stopLayoutAction = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const suppressCreateRef = useRef(false);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [regForm, setRegForm] = useState({ name: "", cuisine: "", address: "", phone: "", description: "" });

  useEffect(() => {
    if (!activeRest) return;
    const floorsFromTables = (activeRest.tables || []).reduce((max, table) => Math.max(max, Number(table.floor) || 1), 1);
    const floorsFromElements = (activeRest.layoutElements || []).reduce((max, element) => {
      if (element.type === "floor") return Math.max(max, Number(element.level) || 1);
      return Math.max(max, Number(element.floor) || 1);
    }, 1);
    const inferredCount = Math.max(1, activeRest.floorCount || 1, floorsFromTables, floorsFromElements);
    setFloorCount((prev) => (prev === inferredCount ? prev : inferredCount));
    setFloorNames((prev) => {
      const next = { ...prev };
      for (let n = 2; n <= inferredCount; n += 1) {
        if (!next[n]) next[n] = `Piso ${n}`;
      }
      return next;
    });
    if (activeFloor > inferredCount) {
      setActiveFloor(inferredCount);
    }
  }, [activeRest?.id, activeRest?.floorCount, activeRest?.tables, activeRest?.layoutElements]);
  const [regDone, setRegDone] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(() => readSaveQueue().length);

  const saveRestaurantProfile = async () => {
    if (!activeRest || !onSaveRestaurant) return;
    setIsSaving(true);
    setSaveStatus("Guardando perfil...");

    try {
      const saved = await persistRestaurantProfile(activeRest);
      const updated = {
        ...activeRest,
        backendBusinessId: saved.id || activeRest.backendBusinessId,
        backendResourceId: activeRest.backendResourceId || activeRest.resourceId,
        name: saved.name || activeRest.name,
        cuisine: saved.cuisine || activeRest.cuisine,
        address: saved.address || activeRest.address,
        phone: saved.phone || activeRest.phone,
        description: saved.description || activeRest.description,
      };
      onSaveRestaurant(updated);
      setSaveStatus("Plano guardado en tu perfil");
    } catch (error) {
      console.error("No se pudo guardar el perfil en el backend:", error);
      // Try one quick retry for transient errors
      try {
        await new Promise(r => setTimeout(r, 400));
        const saved2 = await persistRestaurantProfile(activeRest);
        const updated2 = {
          ...activeRest,
          backendBusinessId: saved2.id || activeRest.backendBusinessId,
          backendResourceId: activeRest.backendResourceId || activeRest.resourceId,
          name: saved2.name || activeRest.name,
          cuisine: saved2.cuisine || activeRest.cuisine,
          address: saved2.address || activeRest.address,
          phone: saved2.phone || activeRest.phone,
          description: saved2.description || activeRest.description,
        };
        onSaveRestaurant(updated2);
        setSaveStatus("Plano guardado en tu perfil (reintento exitoso)");
      } catch (err2) {
        // Final fallback: keep local, enqueue save for background retry, and show detailed message
        onSaveRestaurant(activeRest);
        try {
          enqueueSaveItem({ ts: Date.now(), data: activeRest });
          setPendingSaves(readSaveQueue().length);
        } catch (e) {
          console.warn("Failed to enqueue save:", e);
        }
        const details = err2?.payload ? JSON.stringify(err2.payload) : err2?.message || String(err2);
        setSaveStatus(`No se pudo guardar en el backend. Se conserva localmente y se encoló el intento. (${details})`);
      }
    }
    setIsSaving(false);
    setTimeout(() => setSaveStatus(""), 2500);
  };

  const syncRest = (updated) => {
    setRestList(prev => prev.map(r => r.id === updated.id ? updated : r));
    setActiveRest(updated);
  };

  const updateTableStatus = (tableId, status) => {
    const updated = { ...activeRest, tables: activeRest.tables.map(t => t.id === tableId ? { ...t, status } : t) };
    syncRest(updated);
  };

  const cycleTableStatus = (currentStatus) => {
    const order = ["available", "occupied", "reserved"];
    const nextIndex = (order.indexOf(currentStatus) + 1) % order.length;
    return order[nextIndex] || "available";
  };

  const handleTableClick = (table) => {
    const nextStatus = cycleTableStatus(table.status);
    updateTableStatus(table.id, nextStatus);
  };

  const addTable = () => {
    const currentTables = activeRest?.tables || [];
    const ids = currentTables.map(t => parseInt(t.id.replace("T", ""))).filter(Boolean).sort((a, b) => b - a);
    const nextId = `T${(ids[0] || 0) + 1}`;
    const newTable = { id: nextId, label: nextId, x: 120 + Math.random() * 260, y: 100 + Math.random() * 160, seats: newTableSeats, status: "available", floor: activeFloor };
    const updated = { ...activeRest, tables: [...currentTables, newTable] };
    syncRest(updated);
    setActiveRest(updated);
    setShowAddTable(false);
  };

  const addLayoutElement = (type, x, y) => {
    if (!activeRest) return;
    const updated = { ...activeRest, layoutElements: [...(activeRest.layoutElements || []), createLayoutElement(type, x, y, activeFloor)] };
    syncRest(updated);
    setActiveRest(updated);
  };

  const getLayoutElementLabel = (element) => {
    if (element?.label && element.label.trim()) return element.label.trim();
    switch (element?.type) {
      case "door": return "Puerta";
      case "window": return "Ventana";
      case "stairs": return "Escaleras";
      case "floor": return "Piso";
      default: return "Elemento";
    }
  };

  const updateLayoutElementLabel = (elementId, value) => {
    if (!activeRest) return;
    const nextValue = value;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => element.id === elementId ? { ...element, label: nextValue } : element) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const createFloorPlanBlock = () => {
    if (!activeRest) return;
    const nextFloor = floorCount + 1;
    const response = window.prompt("Nombre del piso", `Piso ${nextFloor}`);
    if (response === null) return;
    const name = response.trim() || `Piso ${nextFloor}`;
    setFloorCount(nextFloor);
    setFloorNames((prev) => ({ ...prev, [nextFloor]: name }));
    setActiveFloor(nextFloor);
    setActiveElementType(null);
    setSelectedTableId(null);
  };

  const removeFloorPlan = (floorToRemove) => {
    if (!activeRest) return;
    if (floorToRemove === 1) return;
    const confirmDelete = window.confirm(`¿Eliminar el piso ${floorNames[floorToRemove] || `Piso ${floorToRemove}`}?`);
    if (!confirmDelete) return;

    const nextFloor = Math.max(1, floorToRemove - 1);
    const updatedTables = (activeRest.tables || []).map((table) => {
      if ((table.floor || 1) !== floorToRemove) return table;
      return { ...table, floor: 1 };
    });
    const updatedLayoutElements = (activeRest.layoutElements || []).filter((element) => {
      if (element.type === "floor") {
        return (element.level || 1) !== floorToRemove;
      }
      return (element.floor || 1) !== floorToRemove;
    });
    const updated = { ...activeRest, tables: updatedTables, layoutElements: updatedLayoutElements };
    syncRest(updated);
    setActiveFloor(nextFloor);
    setFloorCount((prev) => Math.max(1, prev - 1));
    setFloorNames((prev) => {
      const next = { ...prev };
      delete next[floorToRemove];
      return next;
    });
    setSelectedTableId(null);
  };

  const removeLayoutElement = (elementId) => {
    if (!activeRest) return;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).filter((element) => element.id !== elementId) };
    syncRest(updated);
    setActiveRest(updated);
    if (selectedLayoutElementId === elementId) {
      setSelectedLayoutElementId(null);
    }
  };

  const rotateLayoutElement = (elementId) => {
    if (!activeRest) return;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => {
      if (element.id !== elementId) return element;
      const nextRotation = ((element.rotation || 0) + 90) % 360;
      return { ...element, rotation: nextRotation };
    }) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const updateTableFloor = (tableId, floor) => {
    const updated = { ...activeRest, tables: activeRest.tables.map((table) => table.id === tableId ? { ...table, floor } : table) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const updateLayoutElementSize = (elementId, value) => {
    if (!activeRest) return;
    const parsed = Number.parseInt(value, 10);
    const nextValue = Number.isFinite(parsed) ? Math.min(64, Math.max(24, parsed)) : 24;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => {
      if (element.id !== elementId) return element;
      return { ...element, width: nextValue };
    }) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const handleLayoutElementSizeInputChange = (elementId, value) => {
    if (!activeRest) return;
    if (value === "") return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => {
      if (element.id !== elementId) return element;
      return { ...element, width: parsed };
    }) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const updateTableSize = (tableId, size) => {
    if (!activeRest) return;
    const parsed = Number.parseInt(size, 10);
    const nextSize = Number.isFinite(parsed) ? Math.min(64, Math.max(24, parsed)) : 24;
    const updated = { ...activeRest, tables: activeRest.tables.map((table) => table.id === tableId ? { ...table, size: nextSize } : table) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const handleTableSizeInputChange = (tableId, value) => {
    if (!activeRest) return;
    if (value === "") return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const updated = { ...activeRest, tables: activeRest.tables.map((table) => table.id === tableId ? { ...table, size: parsed } : table) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const removeTable = (tableId) => {
    if (!activeRest) return;
    const confirmed = window.confirm("¿Eliminar esta mesa del plano?");
    if (!confirmed) return;
    const updated = { ...activeRest, tables: activeRest.tables.filter(t => t.id !== tableId) };
    syncRest(updated);
    setSelectedTableId(null);
  };

  const handleSvgDrop = useCallback((e) => {
    if (!dragging || !activeRest) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const vbW = 540, vbH = 360;
    const x = ((e.clientX - rect.left) / rect.width) * vbW;
    const y = ((e.clientY - rect.top) / rect.height) * vbH;

    if (dragging.kind === "table") {
      syncRest({ ...activeRest, tables: activeRest.tables.map(t => t.id === dragging.id ? { ...t, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : t) });
    } else if (dragging.kind === "element") {
      syncRest({ ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => element.id === dragging.id ? { ...element, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : element) });
    }

    suppressCreateRef.current = true;
    dragIntentRef.current = false;
    setDragging(null);
  }, [dragging, activeRest]);

  const handleSvgMouseMove = useCallback((e) => {
    if (!dragging || !activeRest) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const vbW = 540, vbH = 360;
    const x = ((e.clientX - rect.left) / rect.width) * vbW;
    const y = ((e.clientY - rect.top) / rect.height) * vbH;

    if (dragging.kind === "table") {
      suppressCreateRef.current = true;
      setRestList(prev => prev.map(r => r.id === activeRest.id ? { ...r, tables: r.tables.map(t => t.id === dragging.id ? { ...t, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : t) } : r));
      setActiveRest(prev => ({ ...prev, tables: prev.tables.map(t => t.id === dragging.id ? { ...t, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : t) }));
    } else if (dragging.kind === "element") {
      suppressCreateRef.current = true;
      setRestList(prev => prev.map(r => r.id === activeRest.id ? { ...r, layoutElements: (r.layoutElements || []).map((element) => element.id === dragging.id ? { ...element, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : element) } : r));
      setActiveRest(prev => ({ ...prev, layoutElements: (prev.layoutElements || []).map((element) => element.id === dragging.id ? { ...element, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : element) }));
    }
  }, [dragging, activeRest]);

  const handleFloorPlanClick = (e) => {
    setSelectedLayoutElementId(null);

    if (!activeElementType || dragging) {
      if (suppressCreateRef.current) {
        suppressCreateRef.current = false;
      }
      return;
    }
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const vbW = 540, vbH = 360;
    const x = ((e.clientX - rect.left) / rect.width) * vbW;
    const y = ((e.clientY - rect.top) / rect.height) * vbH;

    if (dragIntentRef.current || suppressCreateRef.current) {
      dragIntentRef.current = false;
      suppressCreateRef.current = false;
      return;
    }

    addLayoutElement(activeElementType, x, y);
  };

  const visibleTables = (activeRest?.tables || []).filter((table) => (table.floor || 1) === activeFloor);
  const visibleLayoutElements = (activeRest?.layoutElements || []).filter((element) => {
    if (element.type === "floor") return (element.level || 1) === activeFloor;
    return (element.floor || 1) === activeFloor;
  });
  const selectedTable = visibleTables.find((table) => table.id === selectedTableId) || null;
  const selectedLayoutElement = (activeRest?.layoutElements || []).find((element) => element.id === selectedLayoutElementId) || null;
  const getElementLabelLines = (element) => {
    return [getLayoutElementLabel(element)];
  };

  const getElementBoxMetrics = (element) => {
    const label = getLayoutElementLabel(element);
    const width = Math.max(40, Math.min(120, 12 + label.length * 6));
    return { width, height: 24 };
  };

  const stats = {
    total: activeRest.tables.length,
    available: activeRest.tables.filter(t => t.status === "available").length,
    occupied: activeRest.tables.filter(t => t.status === "occupied").length,
    reserved: activeRest.tables.filter(t => t.status === "reserved").length,
  };

  // Background flush of queued saves
  useEffect(() => {
    let mounted = true;
    const flushQueue = async () => {
      const q = readSaveQueue();
      if (!q.length) {
        if (mounted) setPendingSaves(0);
        return;
      }
      for (let i = 0; i < q.length; i++) {
        const item = q[i];
        try {
          await persistRestaurantProfile(item.data);
          removeSaveItemAt(i);
          i--; // adjust index since we removed current
        } catch (e) {
          console.warn("Queued save failed, will retry later:", e);
        }
      }
      if (mounted) setPendingSaves(readSaveQueue().length);
    };

    const id = setInterval(flushQueue, 5000);
    window.addEventListener("online", flushQueue);
    // initial attempt
    flushQueue();
    return () => { mounted = false; clearInterval(id); window.removeEventListener("online", flushQueue); };
  }, []);

  const registerRestaurant = () => {
    const newR = { id: Date.now(), ...regForm, image: "🍴", tables: [], reservations: [], openTime: "12:00", closeTime: "23:00" };
    setRestList(prev => [...prev, newR]);
    setActiveRest(newR);
    setRegDone(true);
    setTimeout(() => { setRegDone(false); setTab("overview"); }, 2500);
  };

  const restaurantTables = activeRest?.tables || [];
  const restaurantElements = activeRest?.layoutElements || [];
  const getFloorLabel = (floorValue) => {
    const floorNumber = Number(floorValue) || 1;
    return floorNames[floorNumber] || (floorNumber === 1 ? "Piso principal" : `Piso ${floorNumber}`);
  };

  const overviewItems = [
    ...restaurantElements.filter((element) => element.type === "door").map((element) => ({
      key: `${element.id}-door`,
      kind: "door",
      icon: "🚪",
      title: "Puerta",
      subtitle: `${getFloorLabel(element.floor || element.level || 1)} · x ${Math.round(element.x)}, y ${Math.round(element.y)}`,
      floorOrder: Number(element.floor || element.level || 1),
    })),
    ...restaurantElements.filter((element) => element.type === "window").map((element) => ({
      key: `${element.id}-window`,
      kind: "window",
      icon: "🪟",
      title: "Ventana",
      subtitle: `${getFloorLabel(element.floor || element.level || 1)} · x ${Math.round(element.x)}, y ${Math.round(element.y)}`,
      floorOrder: Number(element.floor || element.level || 1),
    })),
    ...restaurantElements.filter((element) => element.type === "stairs").map((element) => ({
      key: `${element.id}-stairs`,
      kind: "stairs",
      icon: "🪜",
      title: "Escaleras",
      subtitle: `${getFloorLabel(element.floor || element.level || 1)} · x ${Math.round(element.x)}, y ${Math.round(element.y)}`,
      floorOrder: Number(element.floor || element.level || 1),
    })),
    ...restaurantElements.filter((element) => element.type === "floor").map((element) => ({
      key: `${element.id}-floor`,
      kind: "floor",
      icon: "🏢",
      title: element.label || "Piso",
      subtitle: `${getFloorLabel(element.level || 1)} · x ${Math.round(element.x)}, y ${Math.round(element.y)}`,
      floorOrder: Number(element.level || 1),
    })),
    ...restaurantTables.map((table) => ({
      key: `${table.id}-table`,
      kind: "table",
      icon: "🪑",
      title: `Mesa ${table.label}`,
      subtitle: `${table.seats} personas · ${getFloorLabel(table.floor || 1)} · x ${Math.round(table.x)}, y ${Math.round(table.y)}`,
      floorOrder: Number(table.floor || 1),
    })),
  ].sort((a, b) => a.floorOrder - b.floorOrder || a.title.localeCompare(b.title));

  const elementCounts = {
    doors: restaurantElements.filter((element) => element.type === "door").length,
    windows: restaurantElements.filter((element) => element.type === "window").length,
    stairs: restaurantElements.filter((element) => element.type === "stairs").length,
    floors: restaurantElements.filter((element) => element.type === "floor").length || Math.max(1, floorCount),
    tables: restaurantTables.length,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ width: 240, background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)", display: "flex", flexDirection: "column", flexShrink: 0, boxShadow: "8px 0 24px rgba(2, 6, 23, 0.12)" }}>
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ color: "#f59e0b", fontWeight: 800, fontSize: 20, margin: "0 0 4px" }}>🍽️ MesaYa</p>
          <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>Panel de restaurante</p>
        </div>

        {/* Restaurant selector */}
        <div style={{ padding: "12px 12px 4px" }}>
          <p style={{ color: "#475569", fontSize: 11, fontWeight: 600, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Mi restaurante</p>
          {restList.map(r => (
            <div key={r.id} style={{ width: "100%", textAlign: "left", background: "#1e293b", borderRadius: 10, padding: "10px 12px", color: "white", marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
              <span>{r.image}</span>
              <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Nav */}
        <nav style={{ padding: "12px" }}>
          {[
            { key: "overview", icon: "📊", label: "Resumen" },
            { key: "floorplan", icon: "🗺️", label: "Plano" },
            { key: "reservations", icon: "📅", label: "Reservas" },
            { key: "register", icon: "➕", label: "Nuevo restaurante" },
          ].map(n => (
            <button key={n.key} onClick={() => setTab(n.key)}
              style={{ width: "100%", textAlign: "left", background: tab === n.key ? "#f59e0b22" : "transparent", border: tab === n.key ? "1px solid #f59e0b44" : "1px solid transparent", borderRadius: 10, padding: "10px 14px", color: tab === n.key ? "#f59e0b" : "#94a3b8", cursor: "pointer", marginBottom: 4, display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>

      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Topbar */}
        <div style={{ background: "linear-gradient(90deg, #ffffff 0%, #f8fafc 100%)", borderBottom: "1.5px solid #e2e8f0", padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{activeRest.name}</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>{activeRest.address}</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ background: "#f0fdf4", color: "#15803d", border: "1.5px solid #86efac", borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 700 }}>
              🟢 Abierto · {activeRest.openTime}–{activeRest.closeTime}
            </span>
            <button onClick={onLogout} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 999, color: "#475569", padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)" }}>
              Cerrar sesión
            </button>
          </div>
        </div>

        <div style={{ padding: "28px" }}>

          {/* OVERVIEW */}
          {tab === "overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 28 }}>
                {[
                  { label: "Total mesas", value: stats.total, color: "#6366f1", bg: "#eef2ff" },
                  { label: "Disponibles", value: stats.available, color: "#16a34a", bg: "#dcfce7" },
                  { label: "Ocupadas", value: stats.occupied, color: "#dc2626", bg: "#fee2e2" },
                  { label: "Reservadas", value: stats.reserved, color: "#ca8a04", bg: "#fef9c3" },
                ].map(s => (
                  <div key={s.label} style={{ background: APP_CARD, border: `1.5px solid ${APP_BORDER}`, borderRadius: 16, padding: "20px 20px 16px", borderTop: `4px solid ${s.color}`, boxShadow: CARD_SHADOW }}>
                    <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 13 }}>{s.label}</p>
                    <p style={{ margin: 0, fontSize: 36, fontWeight: 800, color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>

              <div style={{ background: APP_CARD, border: `1.5px solid ${APP_BORDER}`, borderRadius: 18, padding: "22px 22px 20px", boxShadow: CARD_SHADOW, marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>Plano del restaurante</h3>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Cada piso se muestra como un plano estático con las mesas y sus estados.</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      onClick={() => setShowOnlyTables((value) => !value)}
                      style={{ background: showOnlyTables ? "#0f172a" : "white", border: "1px solid #e2e8f0", borderRadius: 999, color: showOnlyTables ? "white" : "#334155", padding: "8px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                    >
                      {showOnlyTables ? "Ver completo" : "Ver solo mesas"}
                    </button>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {[
                        { key: null, label: "Todo", color: "#94a3b8" },
                        { key: "available", label: "Disponibles", color: "#16a34a" },
                        { key: "occupied", label: "Ocupadas", color: "#dc2626" },
                        { key: "reserved", label: "Reservadas", color: "#ca8a04" },
                      ].map((item) => (
                        <button
                          key={String(item.key)}
                          onClick={() => setLegendFilter(item.key)}
                          style={{
                            background: legendFilter === item.key ? item.color : "white",
                            color: legendFilter === item.key ? "white" : "#334155",
                            border: legendFilter === item.key ? "1px solid transparent" : "1px solid #e2e8f0",
                            borderRadius: 999,
                            padding: "8px 12px",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {[
                      { label: "Puertas", value: elementCounts.doors, color: "#16a34a" },
                      { label: "Ventanas", value: elementCounts.windows, color: "#3b82f6" },
                      { label: "Escaleras", value: elementCounts.stairs, color: "#f59e0b" },
                      { label: "Mesas", value: elementCounts.tables, color: "#8b5cf6" },
                      { label: "Pisos", value: elementCounts.floors, color: "#64748b" },
                    ].map((item) => (
                      <div key={item.label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "7px 11px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{item.label}: {item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18, alignItems: "start" }}>
                  {Array.from({ length: floorCount }, (_, index) => index + 1).map((floorNumber) => {
                    const floorTables = (activeRest?.tables || []).filter((table) => (table.floor || 1) === floorNumber);
                    const floorStats = {
                      available: floorTables.filter((table) => table.status === "available").length,
                      occupied: floorTables.filter((table) => table.status === "occupied").length,
                      reserved: floorTables.filter((table) => table.status === "reserved").length,
                    };

                    return (
                      <div key={floorNumber} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: "100%", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)" }}>
                        <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{getFloorLabel(floorNumber)}</p>
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>{floorTables.length} mesas · {floorTables.length ? `${floorStats.available} libres` : "sin mesas"}</p>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>✓ {floorStats.available}</span>
                            <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>● {floorStats.occupied}</span>
                            <span style={{ background: "#fef9c3", color: "#a16207", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>◐ {floorStats.reserved}</span>
                          </div>
                        </div>
                        <FloorPlan
                          tables={activeRest.tables}
                          onTableClick={handleTableClick}
                          editable={false}
                          layoutElements={activeRest.layoutElements || []}
                          floor={floorNumber}
                          showLegend={false}
                          title={getFloorLabel(floorNumber)}
                          showOnlyTables={showOnlyTables}
                          statusFilter={legendFilter}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Control de mesas</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                  {activeRest.tables.map(table => (
                    <div key={table.id} style={{ background: "white", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>{table.label}</span>
                        <Badge status={table.status} />
                      </div>
                      <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 13 }}>{table.seats} personas</p>
                      <div style={{ marginBottom: 8 }}>
                        <button
                          onClick={() => { setActiveFloor(table.floor || 1); setSelectedTableId(table.id); }}
                          style={{ width: "100%", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          {`Piso: ${floorNames[table.floor || 1] || (table.floor === 1 ? "Piso principal" : `Piso ${table.floor || 1}`)}`}
                        </button>
                      </div>
                      <select value={table.status} onChange={e => updateTableStatus(table.id, e.target.value)}
                        style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#f8fafc" }}>
                        <option value="available">Disponible</option>
                        <option value="occupied">Ocupada</option>
                        <option value="reserved">Reservada</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* FLOOR PLAN EDITOR */}
          {tab === "floorplan" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Editor del plano</h2>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Arrastra las mesas para reorganizarlas. Cambia su estado con los controles.</p>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setShowAddTable(true)}
                    style={{ background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    + Añadir mesa
                  </button>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <button onClick={saveRestaurantProfile} disabled={isSaving}
                      style={{ background: isSaving ? "#94d3a2" : "#16a34a", color: "white", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: isSaving ? "not-allowed" : "pointer" }}>
                      {isSaving ? "Guardando..." : "Guardar plano"}
                    </button>
                    {pendingSaves > 0 && (
                      <div style={{ position: "absolute", top: -8, right: -8, background: "#f59e0b", color: "white", borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 700 }}>{pendingSaves}</div>
                    )}
                  </div>
                </div>
              </div>
              {saveStatus && (
                <div style={{ marginBottom: 18, color: "#16a34a", fontSize: 14, fontWeight: 600 }}>{saveStatus}</div>
              )}

              {showAddTable && (
                <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1e40af" }}>Sillas:</span>
                  {[2, 4, 6, 8].map(n => (
                    <button key={n} onClick={() => setNewTableSeats(n)}
                      style={{ padding: "8px 18px", borderRadius: 10, border: newTableSeats === n ? "2px solid #2563eb" : "1.5px solid #bfdbfe", background: newTableSeats === n ? "#2563eb" : "white", color: newTableSeats === n ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                      {n}p
                    </button>
                  ))}
                  {floorCount > 1 ? (
                    <>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#1e40af" }}>Piso:</span>
                      {Array.from({ length: floorCount }, (_, index) => index + 1).map(n => (
                        <button key={n} onClick={() => setActiveFloor(n)} style={{ padding: "8px 14px", borderRadius: 10, border: activeFloor === n ? "2px solid #2563eb" : "1.5px solid #bfdbfe", background: activeFloor === n ? "#2563eb" : "white", color: activeFloor === n ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                          {floorNames[n] || (n === 1 ? "Piso principal" : `Piso ${n}`)}
                        </button>
                      ))}
                    </>
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#1e40af" }}>Se asignará al piso principal</span>
                  )}
                  <button onClick={addTable} style={{ background: "#16a34a", color: "white", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, cursor: "pointer" }}>Crear</button>
                  <button onClick={() => setShowAddTable(false)} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
                </div>
              )}

              <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", marginBottom: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Ver piso:</span>
                {Array.from({ length: floorCount }, (_, index) => index + 1).map((floor) => (
                  <div key={floor} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => { setActiveFloor(floor); setSelectedTableId(null); }} style={{ padding: "8px 12px", borderRadius: 10, border: activeFloor === floor ? "2px solid #0f172a" : "1px solid #e2e8f0", background: activeFloor === floor ? "#0f172a" : "white", color: activeFloor === floor ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                      {floorNames[floor] || (floor === 1 ? "Piso principal" : `Piso ${floor}`)}
                    </button>
                    {floor > 1 && (
                      <button onClick={() => removeFloorPlan(floor)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontWeight: 700, cursor: "pointer" }} title="Eliminar piso">
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Añadir referencia:</span>
                {[
                  { key: "door", label: "Puerta" },
                  { key: "window", label: "Ventana" },
                  { key: "stairs", label: "Escaleras" },
                  { key: "floor", label: "Crear piso" },
                ].map(item => (
                  <button key={item.key} onClick={() => {
                    if (item.key === "floor") {
                      createFloorPlanBlock();
                    } else {
                      setActiveElementType(activeElementType === item.key ? null : item.key);
                    }
                  }} style={{ padding: "8px 12px", borderRadius: 10, border: activeElementType === item.key ? "2px solid #0f172a" : "1px solid #e2e8f0", background: activeElementType === item.key ? "#0f172a" : "white", color: activeElementType === item.key ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                    {item.label}
                  </button>
                ))}
                <span style={{ fontSize: 13, color: "#64748b" }}>Haz clic en el plano para colocar el elemento seleccionado.</span>
              </div>

              {/* Editable SVG floor plan */}
              <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
                <svg
                  width="100%"
                  viewBox="0 0 540 360"
                  style={{ display: "block", cursor: activeElementType ? "crosshair" : "default" }}
                  onClick={handleFloorPlanClick}
                  onMouseMove={handleSvgMouseMove}
                  onMouseUp={handleSvgDrop}
                  onMouseLeave={() => setDragging(null)}
                >
                  <defs>
                    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="540" height="360" fill="url(#grid)" />
                  <text x="270" y="20" textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="600">PLANO EDITABLE — arrastra mesas y elementos</text>

                  {visibleLayoutElements.length === 0 && visibleTables.length === 0 && (
                    <text x="270" y="190" textAnchor="middle" fontSize="13" fill="#94a3b8">Plano vacío para {floorNames[activeFloor] || `Piso ${activeFloor}`}</text>
                  )}

                  {visibleLayoutElements.map((element) => {
                    const color = element.type === "door" ? "#34d399" : element.type === "window" ? "#60a5fa" : element.type === "stairs" ? "#f59e0b" : "#cbd5e1";
                    const rotation = element.rotation || 0;
                    const isSelected = selectedLayoutElementId === element.id;
                    if (element.type === "floor") {
                      return (
                        <g key={element.id} transform={`rotate(${rotation} ${element.x} ${element.y})`} onMouseDown={(e) => { e.stopPropagation(); suppressCreateRef.current = true; dragIntentRef.current = true; setSelectedLayoutElementId(element.id); setDragging({ kind: "element", id: element.id }); }} onClick={(e) => { e.stopPropagation(); setSelectedLayoutElementId(element.id); }}>
                          <rect x={element.x - (element.width || 140) / 2} y={element.y - (element.height || 90) / 2} width={element.width || 140} height={element.height || 90} rx={16} fill="#f8fafc" stroke="#94a3b8" strokeDasharray="6 4" />
                          <text x={element.x} y={element.y - 3} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#475569">{element.label || "Piso superior"}</text>
                          <text x={element.x} y={element.y + 14} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">{element.level > 1 ? "Piso 2" : "Piso 1"}</text>
                          {isSelected && (
                            <g onMouseDown={stopLayoutAction} onClick={stopLayoutAction}>
                              <rect x={element.x + 70} y={element.y - 42} width="72" height="24" rx="8" fill="#0f172a" />
                              <text x={element.x + 106} y={element.y - 26} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); rotateLayoutElement(element.id); }}>Rotar</text>
                              <rect x={element.x + 70} y={element.y - 14} width="72" height="24" rx="8" fill="#dc2626" />
                              <text x={element.x + 106} y={element.y + 2} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); removeLayoutElement(element.id); }}>Eliminar</text>
                            </g>
                          )}
                        </g>
                      );
                    }
                    if (element.type === "stairs") {
                      const stairWidth = Math.max(24, Math.min(64, element.width || 64));
                      const stairHeight = Math.max(36, stairWidth * 1.05);
                      const rectX = element.x - stairWidth / 2;
                      const rectY = element.y - stairHeight / 2;
                      const innerX = stairWidth * 0.18;
                      const innerY = stairHeight * 0.16;
                      const topY = element.y - stairHeight / 2 + stairHeight * 0.28;
                      const bottomY = element.y + stairHeight / 2 - stairHeight * 0.18;
                      return (
                        <g key={element.id} transform={`rotate(${rotation} ${element.x} ${element.y})`} onMouseDown={(e) => { e.stopPropagation(); suppressCreateRef.current = true; dragIntentRef.current = true; setSelectedLayoutElementId(element.id); setDragging({ kind: "element", id: element.id }); }} onClick={(e) => { e.stopPropagation(); setSelectedLayoutElementId(element.id); }}>
                          <rect x={rectX} y={rectY} width={stairWidth} height={stairHeight} rx={12} fill="#fff7ed" stroke={color} strokeWidth="2" />
                          <path d={`M ${element.x - stairWidth / 2 + innerX} ${bottomY} L ${element.x + stairWidth / 2 - innerX} ${bottomY} L ${element.x + stairWidth / 2 - innerX} ${topY} L ${element.x - stairWidth / 2 + stairWidth * 0.4} ${topY} L ${element.x - stairWidth / 2 + stairWidth * 0.4} ${element.y - innerY} L ${element.x - stairWidth / 2 + innerX} ${element.y - innerY} Z`} fill={color} opacity="0.9" />
                          {isSelected && (
                            <g onMouseDown={stopLayoutAction} onClick={stopLayoutAction}>
                              <rect x={element.x + stairWidth / 2 + 6} y={element.y - stairHeight / 2 - 14} width="72" height="24" rx="8" fill="#0f172a" />
                              <text x={element.x + stairWidth / 2 + 42} y={element.y - stairHeight / 2 + 2} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); rotateLayoutElement(element.id); }}>Rotar</text>
                              <rect x={element.x + stairWidth / 2 + 6} y={element.y - stairHeight / 2 + 14} width="72" height="24" rx="8" fill="#dc2626" />
                              <text x={element.x + stairWidth / 2 + 42} y={element.y - stairHeight / 2 + 30} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); removeLayoutElement(element.id); }}>Eliminar</text>
                            </g>
                          )}
                        </g>
                      );
                    }
                    const box = getElementBoxMetrics(element);
                    const labelLines = getElementLabelLines(element);
                    return (
                      <g key={element.id} transform={`rotate(${rotation} ${element.x} ${element.y})`} onMouseDown={(e) => { e.stopPropagation(); suppressCreateRef.current = true; dragIntentRef.current = true; setSelectedLayoutElementId(element.id); setDragging({ kind: "element", id: element.id }); }} onClick={(e) => { e.stopPropagation(); setSelectedLayoutElementId(element.id); }}>
                        <rect x={element.x - box.width / 2} y={element.y - box.height / 2} width={box.width} height={box.height} rx={10} fill={element.type === "window" ? "#eff6ff" : "#f0fdf4"} stroke={color} strokeWidth="2" />
                        <text x={element.x} y={element.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill={color}>
                          {labelLines[0]}
                        </text>
                        {isSelected && (
                          <g onMouseDown={stopLayoutAction} onClick={stopLayoutAction}>
                            <rect x={element.x + box.width / 2 + 2} y={element.y - 34} width="72" height="24" rx={8} fill="#0f172a" />
                            <text x={element.x + box.width / 2 + 38} y={element.y - 18} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); rotateLayoutElement(element.id); }}>Rotar</text>
                            <rect x={element.x + box.width / 2 + 2} y={element.y - 6} width="72" height="24" rx={8} fill="#dc2626" />
                            <text x={element.x + box.width / 2 + 38} y={element.y + 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); removeLayoutElement(element.id); }}>Eliminar</text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {visibleTables.map((table) => {
                    const size = table.size || (table.seats <= 2 ? 48 : table.seats <= 4 ? 60 : 72);
                    const col = TABLE_COLORS[table.status];
                    return (
                      <g key={table.id} onMouseDown={(e) => { e.stopPropagation(); suppressCreateRef.current = true; dragIntentRef.current = true; setDragging({ kind: "table", id: table.id }); setSelectedTableId(table.id); setSelectedLayoutElementId(null); }} onClick={() => { setSelectedTableId(table.id); setSelectedLayoutElementId(null); }} style={{ cursor: "grab" }}>
                        <rect x={table.x - size / 2 + 3} y={table.y - size / 2 + 3} width={size} height={size} rx={10} fill="#00000015" />
                        <rect x={table.x - size / 2} y={table.y - size / 2} width={size} height={size} rx={table.seats <= 2 ? size / 2 : 10}
                          fill={col.bg} stroke={col.border} strokeWidth="2" />
                        {Array.from({ length: table.seats }).map((_, i) => {
                          const angle = (i / table.seats) * 2 * Math.PI - Math.PI / 2;
                          const r = size / 2 + 12;
                          return <circle key={i} cx={table.x + r * Math.cos(angle)} cy={table.y + r * Math.sin(angle)} r={6} fill="#e2e8f0" stroke={col.border} strokeWidth="1" />;
                        })}
                        <text x={table.x} y={table.y - 2} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill={col.text}>{table.label}</text>
                        <text x={table.x} y={table.y + 12} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill={col.text}>{table.seats}p</text>
                        <rect x={table.x - 24} y={table.y + 20} width="48" height="12" rx="6" fill="#0f172a" opacity="0.8" />
                        <text x={table.x} y={table.y + 28} textAnchor="middle" fontSize="9" fontWeight="700" fill="white">{table.floor > 1 ? `P${table.floor}` : "P1"}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {selectedTable && (
                <div style={{ marginTop: 18, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: "#0f172a" }}>Mesa {selectedTable.label} seleccionada</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Asigna el piso para que el cliente vea mejor la ubicación.</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {floorCount > 1 ? Array.from({ length: floorCount }, (_, index) => index + 1).map(floor => (
                      <button key={floor} onClick={() => updateTableFloor(selectedTable.id, floor)} style={{ padding: "8px 12px", borderRadius: 10, border: selectedTable.floor === floor ? "2px solid #0f172a" : "1px solid #e2e8f0", background: selectedTable.floor === floor ? "#0f172a" : "white", color: selectedTable.floor === floor ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                        {floorNames[floor] || (floor === 1 ? "Piso principal" : `Piso ${floor}`)}
                      </button>
                    )) : (
                      <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Se usará el piso principal por defecto</span>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#334155" }}>
                      Tamaño
                      <input
                        type="number"
                        min="24"
                        max="64"
                        step="1"
                        value={selectedTable.size || 60}
                        onBlur={(e) => updateTableSize(selectedTable.id, e.target.value)}
                        onChange={(e) => handleTableSizeInputChange(selectedTable.id, e.target.value)}
                        style={{ width: 70, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff" }}
                      />
                    </label>
                    <button
                      onClick={() => removeTable(selectedTable.id)}
                      style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontWeight: 700, cursor: "pointer" }}
                    >
                      Borrar mesa
                    </button>
                  </div>
                </div>
              )}

              {selectedLayoutElement && (
                <div style={{ marginTop: 18, background: "#fff7ed", border: "1.5px solid #fdba74", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0, maxWidth: 380 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: "#9a2c00" }}>{getLayoutElementLabel(selectedLayoutElement)}</p>
                    <p style={{ margin: "4px 0 0", color: "#c2410c", fontSize: 13 }}>Arrastra el elemento para moverlo. Cambia su nombre y tamaño para adaptarlo mejor al plano.</p>
                  </div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#7c2d12" }}>Nombre del elemento</label>
                  <input
                    value={selectedLayoutElement.label || ""}
                    onChange={(e) => updateLayoutElementLabel(selectedLayoutElement.id, e.target.value)}
                    placeholder={getLayoutElementLabel(selectedLayoutElement)}
                    style={{ ...inputStyle, marginBottom: 0, minHeight: 44, width: "100%", maxWidth: 340, whiteSpace: "normal" }}
                  />
                  {selectedLayoutElement.type === "stairs" && (
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#7c2d12" }}>
                      Tamaño de escalera
                      <input
                        type="number"
                        min="24"
                        max="64"
                        step="1"
                        value={selectedLayoutElement.width || 64}
                        onBlur={(e) => updateLayoutElementSize(selectedLayoutElement.id, e.target.value)}
                        onChange={(e) => handleLayoutElementSizeInputChange(selectedLayoutElement.id, e.target.value)}
                        style={{ ...inputStyle, marginTop: 4, marginBottom: 0, width: "100%" }}
                      />
                    </label>
                  )}
                </div>
              )}


            </div>
          )}

          {/* RESERVATIONS */}
          {tab === "reservations" && (
            <div>
              <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Reservas de hoy</h2>
              {activeRest.reservations.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
                  <p style={{ fontSize: 40, marginBottom: 12 }}>📅</p>
                  <p style={{ fontSize: 16 }}>No hay reservas registradas</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {activeRest.reservations.map(res => {
                    const table = activeRest.tables.find(t => t.id === res.tableId);
                    return (
                      <div key={res.id} style={{ background: "white", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        <div style={{ background: "#eff6ff", borderRadius: 12, padding: "12px 16px", textAlign: "center", minWidth: 64 }}>
                          <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#2563eb" }}>{res.time}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#60a5fa" }}>{res.date.split("-")[2]}/{res.date.split("-")[1]}</p>
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#0f172a", fontSize: 16 }}>{res.name}</p>
                          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>Mesa {table?.label} · {res.guests} personas</p>
                        </div>
                        <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600 }}>
                          ✓ {res.status === "confirmed" ? "Confirmada" : res.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* REGISTER NEW RESTAURANT */}
          {tab === "register" && (
            <div style={{ maxWidth: 520 }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Registrar nuevo restaurante</h2>
              <p style={{ color: "#64748b", marginBottom: 24 }}>Una vez registrado, podrás añadir el plano de mesas desde el editor.</p>

              {regDone ? (
                <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 14, padding: "24px", textAlign: "center" }}>
                  <p style={{ fontSize: 40 }}>✅</p>
                  <p style={{ fontWeight: 700, color: "#15803d", fontSize: 18 }}>¡Restaurante registrado!</p>
                </div>
              ) : (
                <>
                  {[
                    { key: "name", label: "Nombre del restaurante", placeholder: "Ej: El Rincón de María" },
                    { key: "cuisine", label: "Tipo de cocina", placeholder: "Ej: Española, Italiana…" },
                    { key: "address", label: "Dirección", placeholder: "Calle, número, ciudad" },
                    { key: "phone", label: "Teléfono", placeholder: "+34 91 000 0000" },
                  ].map(f => (
                    <div key={f.key}>
                      <Label>{f.label}</Label>
                      <input placeholder={f.placeholder} value={regForm[f.key]}
                        onChange={e => setRegForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={inputStyle} />
                    </div>
                  ))}

                  <Label>Descripción</Label>
                  <textarea
                    placeholder="Describe brevemente tu restaurante…"
                    value={regForm.description}
                    onChange={e => setRegForm(p => ({ ...p, description: e.target.value }))}
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />

                  <button
                    onClick={registerRestaurant}
                    disabled={!regForm.name || !regForm.address}
                    style={{ width: "100%", background: regForm.name && regForm.address ? "#0f172a" : "#e2e8f0", color: regForm.name && regForm.address ? "white" : "#94a3b8", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
                    Registrar restaurante
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [restaurants, setRestaurants] = useState(INITIAL_RESTAURANTS);
  const [view, setView] = useState("landing"); // landing | client-home | client-reserve | restaurant-auth | restaurant-dash
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [backendStatus, setBackendStatus] = useState("loading");
  const [restaurantSession, setRestaurantSession] = useState(readRestaurantSession());
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadRestaurants() {
      const registered = readRegisteredRestaurants();
      const combined = [...INITIAL_RESTAURANTS, ...registered];

      try {
        const liveRestaurants = await Promise.all(combined.map(mapRestaurantToBackend));
        if (isMounted) {
          setRestaurants(liveRestaurants);
          setBackendStatus("connected");
        }
      } catch (error) {
        if (isMounted) {
          setRestaurants(combined);
          setBackendStatus("fallback");
          console.error("No se pudo conectar con el backend:", error);
        }
      }
    }

    loadRestaurants();
    return () => {
      isMounted = false;
    };
  }, []);

  const syncRestaurantSession = (session) => {
    setRestaurantSession(session);
    writeRestaurantSession(session);
  };

  const handleRestaurantRegister = async (form) => {
    const { name, cuisine, address, phone, email, password, description } = form;
    if (!name || !email || !password || !address) {
      throw new Error("Completa los campos obligatorios");
    }

    const accounts = readAccounts();
    if (accounts.some((account) => account.email === email)) {
      throw new Error("Ya existe una cuenta con ese email");
    }

    let businessId = null;
    let resourceId = null;
    let registrationError = null;

    try {
      const business = await requestJson(`${API_BASE_URL}/v1/businesses`, {
        method: "POST",
        body: JSON.stringify({
          name,
          type: "RESTAURANT",
          cuisine,
          address,
          phone,
          description,
          tableLayoutJson: JSON.stringify([]),
        }),
      });
      businessId = business.id;

      const resource = await requestJson(`${API_BASE_URL}/v1/businesses/${business.id}/resources`, {
        method: "POST",
        body: JSON.stringify({ businessId: business.id, name: `${name} mesa`, capacity: 8 }),
      });
      resourceId = resource.id;
    } catch (error) {
      console.warn("No se pudo crear el negocio/resource en el backend:", error);
      registrationError = error;
    }

    const restaurant = {
      id: Date.now(),
      name,
      cuisine,
      address,
      phone,
      description,
      image: "🍴",
      tables: [],
      reservations: [],
      openTime: "12:00",
      closeTime: "23:00",
      backendBusinessId: businessId,
      backendResourceId: resourceId,
    };

    writeAccounts([...accounts, { email, password, restaurantId: restaurant.id, businessId, resourceId }]);
    writeRegisteredRestaurants([...readRegisteredRestaurants(), restaurant]);
    setRestaurants((prev) => [...prev, restaurant]);

    const session = { email, restaurantId: restaurant.id, businessId, resourceId };
    syncRestaurantSession(session);
    setAuthError("");
    setView("restaurant-dash");

    if (registrationError) {
      console.warn("Registro completado localmente, pero hubo un problema en backend:", registrationError);
    }
  };

  const handleRestaurantLogin = async ({ email, password }) => {
    const accounts = readAccounts();
    const account = accounts.find((item) => item.email === email);
    if (!account || account.password !== password) {
      throw new Error("Email o contraseña incorrectos");
    }

    const registeredRestaurants = readRegisteredRestaurants();
    const restaurant = registeredRestaurants.find((item) => item.id === account.restaurantId);
    if (restaurant && !restaurants.some((r) => r.id === restaurant.id)) {
      setRestaurants((prev) => [...prev, restaurant]);
    }

    const session = { email, restaurantId: account.restaurantId, businessId: account.businessId, resourceId: account.resourceId };
    syncRestaurantSession(session);
    setAuthError("");
    setView("restaurant-dash");
  };

  const handleConfirmReservation = async (data) => {
    const restaurantId = selectedRestaurant?.id;
    const restaurant = restaurants.find((r) => r.id === restaurantId);
    if (!restaurant) return;

    const startTime = buildIsoDateTime(data.date, data.time);
    const payload = {
      resourceId: data.resourceId || restaurant.backendResourceId,
      customerName: data.name,
      customerEmail: data.email,
      partySize: data.guests,
      startTime,
      endTime: getEndTimeFromStart(startTime, 2),
    };

    try {
      const created = await requestJson(`${API_BASE_URL}/v1/reservations`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setRestaurants((prev) =>
        prev.map((r) => {
          if (r.id !== restaurantId) return r;
          return {
            ...r,
            tables: r.tables.map((t) => (t.id === data.tableId ? { ...t, status: "reserved" } : t)),
            reservations: [
              ...r.reservations,
              {
                id: created?.id?.toString() || `R${Date.now()}`,
                tableId: data.tableId,
                date: data.date,
                time: data.time,
                name: data.name,
                guests: data.guests,
                status: "confirmed",
              },
            ],
          };
        })
      );
      setBackendStatus("connected");
    } catch (error) {
      console.error("Reserva local fallback:", error);
      setBackendStatus("fallback");
      setRestaurants((prev) =>
        prev.map((r) => {
          if (r.id !== restaurantId) return r;
          return {
            ...r,
            tables: r.tables.map((t) => (t.id === data.tableId ? { ...t, status: "reserved" } : t)),
            reservations: [
              ...r.reservations,
              {
                id: `R${Date.now()}`,
                tableId: data.tableId,
                date: data.date,
                time: data.time,
                name: data.name,
                guests: data.guests,
                status: "confirmed",
              },
            ],
          };
        })
      );
    }
  };

  const logoutRestaurant = () => {
    syncRestaurantSession(null);
    setView("landing");
  };

  const handleSaveRestaurant = (updatedRestaurant) => {
    setRestaurants((prev) => prev.map((r) => (r.id === updatedRestaurant.id ? updatedRestaurant : r)));
    const registered = readRegisteredRestaurants();
    writeRegisteredRestaurants(registered.map((r) => (r.id === updatedRestaurant.id ? updatedRestaurant : r)));
  };

  let content;
  if (view === "landing") {
    content = <LandingPage onEnterClient={() => setView("client-home")} onEnterRestaurant={() => setView("restaurant-auth")} />;
  } else if (view === "client-home") {
    content = (
      <ClientHome
        restaurants={restaurants}
        onSelectRestaurant={(r) => { setSelectedRestaurant(r); setView("client-reserve"); }}
        onBack={() => setView("landing")}
      />
    );
  } else if (view === "client-reserve") {
    content = (
      <ClientReservation
        restaurant={restaurants.find((r) => r.id === selectedRestaurant?.id) || selectedRestaurant}
        onBack={() => setView("client-home")}
        onConfirm={handleConfirmReservation}
      />
    );
  } else if (view === "restaurant-auth") {
    content = (
      <RestaurantAuth
        onRegister={handleRestaurantRegister}
        onLogin={handleRestaurantLogin}
        onBack={() => setView("landing")}
        errorMessage={authError}
      />
    );
  } else if (view === "restaurant-dash") {
    content = (
      <RestaurantDashboard
        restaurants={restaurants}
        initialRestaurantId={restaurantSession?.restaurantId}
        onBack={() => setView("landing")}
        onLogout={logoutRestaurant}
        onSaveRestaurant={handleSaveRestaurant}
      />
    );
  }

  return (
    <ErrorBoundary>
      <div style={{ minHeight: "100vh" }}>
        {content}
      </div>
    </ErrorBoundary>
  );
}
