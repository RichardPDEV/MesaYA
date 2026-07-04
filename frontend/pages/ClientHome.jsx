import React, { useEffect, useState } from "react";
import { API_BASE_URL, APP_CARD, APP_BORDER, CARD_SHADOW, CARD_SHADOW_HOVER } from "../lib/constants.js";
import { setAccessToken, clearAccessToken, requestJson } from "../lib/api.js";
import { readClientSession, writeClientSession } from "../lib/storage.js";

export default function ClientHome({ restaurants, onSelectRestaurant, onBack }) {
  const [search, setSearch] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(readClientSession()?.token));
  const [profileData, setProfileData] = useState(() => {
    const session = readClientSession();
    if (!session?.token) return null;
    return { username: session.username, displayName: session.displayName, role: session.role };
  });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const filtered = restaurants.filter((r) => {
    const name = (r.name || "").toLowerCase();
    const cuisine = (r.cuisine || "").toLowerCase();
    const query = search.toLowerCase();
    return name.includes(query) || cuisine.includes(query);
  });

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
  };

  const loadProfile = async () => {
    try {
      const data = await requestJson(`${API_BASE_URL}/auth/me`);
      setProfileData(data);
      setProfileError("");
    } catch (err) {
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
    }
    loadProfile();
  }, [isAuthenticated]);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f8fafc 0%, #fefefe 100%)" }}>
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #111827 100%)", padding: "18px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
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
        {isAuthenticated ? (
          <div style={{ position: "relative" }}>
            <button onClick={() => setProfileMenuOpen((value) => !value)} style={{ background: "white", color: "#0f172a", border: "none", borderRadius: 999, padding: "10px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              👤 {profileData?.displayName || profileData?.username || "Perfil"}
            </button>
            {profileMenuOpen ? (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: APP_CARD, borderRadius: 14, border: `1px solid ${APP_BORDER}`, minWidth: 240, boxShadow: CARD_SHADOW, zIndex: 20 }}>
                <div style={{ padding: "14px 14px 12px", borderBottom: `1px solid ${APP_BORDER}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #fb923c)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 800 }}>
                      {(profileData?.displayName || profileData?.username || "U").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: "#0f172a" }}>{profileData?.displayName || profileData?.username || "Usuario"}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{profileData?.username || "Tu cuenta"}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 6 }}>
                    <div style={{ marginBottom: 4 }}><strong>Nombre:</strong> {profileData?.displayName || profileData?.username || "—"}</div>
                    <div style={{ marginBottom: 4 }}><strong>Correo:</strong> {profileData?.username || "—"}</div>
                    <div><strong>Rol:</strong> {profileData?.role || "USER"}</div>
                  </div>
                </div>
                <button onClick={handleLogout} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "12px 14px", cursor: "pointer", color: "#dc2626", fontWeight: 700 }}>
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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
            const available = (r.tables || []).filter(t => t.status === "available").length;
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
                    <span style={{ fontSize: 13, color: "#64748b" }}>📍 {(r.address || "").split(",")[1]?.trim() || r.address || "—"}</span>
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
