import React, { useEffect, useRef, useState } from "react";
import { APP_CARD, APP_BORDER, CARD_SHADOW, CARD_SHADOW_HOVER } from "../lib/constants.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function ClientHome({ restaurants, onSelectRestaurant, onBack }) {
  const { user, isAuthenticated, isLoading, authError: authContextError, login, register, logout, confirmEmail, resendConfirmation } = useAuth();
  const [search, setSearch] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFirstName, setAuthFirstName] = useState("");
  const [authLastName, setAuthLastName] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [pendingConfirmUsername, setPendingConfirmUsername] = useState("");
  const [authVerificationCode, setAuthVerificationCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef(null);
  const [authError, setAuthError] = useState("");
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [pendingRestaurant, setPendingRestaurant] = useState(null);
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
      await logout();
    } catch (err) {
      console.warn("Logout request failed", err);
    }
    setProfileError("");
    setProfileMenuOpen(false);
  };

  const handleAuthSubmit = async (e) => {
    e?.preventDefault?.();
    setAuthError("");
    try {
      if (authMode === "register") {
        // Basic validations for registration
        const email = (authEmail || "").trim();
        // Allow any reasonable email address for verification
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          throw new Error("Por favor usa una dirección de correo válida (ej.: usuario@ejemplo.com)");
        }
        if (!authFirstName.trim() || !authLastName.trim()) {
          throw new Error("Por favor indica nombre y apellido");
        }
        if (authPassword !== authConfirmPassword) {
          throw new Error("Las contraseñas no coinciden");
        }
        await register({ username: email, password: authPassword, displayName: `${authFirstName.trim()} ${authLastName.trim()}` });
        setAuthInfo("Se ha enviado un código de verificación al correo proporcionado. Revisa tu bandeja de entrada.");
        setPendingConfirmUsername(email.toLowerCase());
        setResendCooldown(30);
        // Clear form fields after successful registration
        setAuthEmail("");
        setAuthFirstName("");
        setAuthLastName("");
        setAuthPassword("");
        setAuthConfirmPassword("");
        setAuthName("");
      } else {
        await login({ username: authEmail, password: authPassword });
      }
      // Keep auth panel open after registration so user can enter confirmation code
      if (authMode === "register") {
        setAuthPanelOpen(true);
      } else {
        setAuthPanelOpen(false);
      }
      setProfileError("");
      if (pendingRestaurant) {
        const toOpen = pendingRestaurant;
        setPendingRestaurant(null);
        onSelectRestaurant?.(toOpen);
      }
    } catch (err) {
      setAuthInfo("");
      setAuthError(err.message || "No se pudo procesar la solicitud");
    }
  };

  const handleConfirmCode = async (e) => {
    e?.preventDefault?.();
    setAuthError("");
    try {
      if (!pendingConfirmUsername) throw new Error("Usuario desconocido para confirmar");
      if (!authVerificationCode || !authVerificationCode.trim()) throw new Error("Introduce el código de verificación");
      await confirmEmail(pendingConfirmUsername, authVerificationCode.trim());
      setAuthInfo("Correo verificado correctamente. Ya puedes usar tu cuenta.");
      setPendingConfirmUsername("");
      setAuthVerificationCode("");
      setResendCooldown(0);
    } catch (err) {
      setAuthError(err.message || "No se pudo confirmar el código");
    }
  };

  const handleResendCode = async () => {
    setAuthError("");
    try {
      if (!pendingConfirmUsername) throw new Error("Usuario desconocido para reenviar");
      await resendConfirmation(pendingConfirmUsername);
      setAuthInfo("Código reenviado. Revisa tu bandeja de entrada.");
      setResendCooldown(30);
    } catch (err) {
      setAuthError(err.message || "No se pudo reenviar el código");
    }
  };

  useEffect(() => {
    if (!resendCooldown || resendCooldown <= 0) return;
    const id = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    if (pendingConfirmUsername && authPanelOpen) {
      // small timeout to ensure input is mounted
      setTimeout(() => codeInputRef.current?.focus?.(), 50);
    }
  }, [pendingConfirmUsername, authPanelOpen]);

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
        <div style={{ position: "relative" }}>
          <button onClick={() => setProfileMenuOpen((value) => !value)} style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #ffffff", background: "linear-gradient(135deg, #f8fafc, #cbd5e1)", color: "#0f172a", cursor: "pointer", fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(15, 23, 42, 0.18)" }} aria-label="Perfil">
            {isAuthenticated ? ((user?.displayName || user?.username || "U").charAt(0).toUpperCase()) : "👤"}
          </button>
          {profileMenuOpen ? (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: APP_CARD, borderRadius: 14, border: `1px solid ${APP_BORDER}`, minWidth: 220, boxShadow: CARD_SHADOW, zIndex: 20 }}>
              {isAuthenticated ? (
                <>
                  <div style={{ padding: "12px 14px", borderBottom: `1px solid ${APP_BORDER}` }}>
                    <div style={{ fontWeight: 800, color: "#0f172a" }}>{user?.displayName || user?.username || "Usuario"}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{user?.username || "Tu cuenta"}</div>
                  </div>
                  <button onClick={handleLogout} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "12px 14px", cursor: "pointer", color: "#dc2626", fontWeight: 700 }}>
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setAuthMode("login"); setAuthError(""); setAuthPanelOpen(true); setProfileMenuOpen(false); }} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "12px 14px", cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>
                    Iniciar sesión
                  </button>
                  <button onClick={() => { setAuthMode("register"); setAuthError(""); setAuthPanelOpen(true); setProfileMenuOpen(false); }} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "12px 14px", cursor: "pointer", color: "#0f172a", fontWeight: 700 }}>
                    Crear cuenta
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {authPanelOpen ? (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.5)", zIndex: 60 }}>
          <div style={{ width: "min(680px, 92%)", background: APP_CARD, borderRadius: 20, padding: "28px 28px", boxShadow: CARD_SHADOW }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Acceso de cliente</div>
                <h2 style={{ margin: "8px 0 6px", color: "#0f172a", fontSize: 28, fontWeight: 800 }}>{authMode === "register" ? "Crea tu cuenta" : "Inicia sesión para reservar"}</h2>
                <p style={{ margin: 0, color: "#64748b" }}>Regístrate o entra con tu cuenta para confirmar una mesa en segundos.</p>
              </div>
              <button onClick={() => setAuthPanelOpen(false)} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}>✕</button>
            </div>

            <div style={{ marginTop: 12 }}>
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

              <form onSubmit={(e) => { handleAuthSubmit(e); }}>
                {authMode === "register" && (
                  <>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: 13, color: "#475569", marginBottom: 6 }}>Nombre</label>
                        <input value={authFirstName} onChange={(e) => setAuthFirstName(e.target.value)} placeholder="Nombre" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${APP_BORDER}` }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: 13, color: "#475569", marginBottom: 6 }}>Apellido</label>
                        <input value={authLastName} onChange={(e) => setAuthLastName(e.target.value)} placeholder="Apellido" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${APP_BORDER}` }} />
                      </div>
                    </div>
                  </>
                )}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", fontSize: 13, color: "#475569", marginBottom: 6 }}>Email</label>
                  <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="correo@ejemplo.com" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${APP_BORDER}`, marginBottom: 12 }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", fontSize: 13, color: "#475569", marginBottom: 6 }}>Contraseña</label>
                  <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${APP_BORDER}`, marginBottom: 8 }} />
                </div>
                {authMode === "register" && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: "block", fontSize: 13, color: "#475569", marginBottom: 6 }}>Confirmar contraseña</label>
                    <input type="password" value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} placeholder="Repite tu contraseña" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${APP_BORDER}`, marginBottom: 8 }} />
                  </div>
                )}
                {authError ? <p style={{ color: "#dc2626", fontSize: 13, margin: "6px 0 12px" }}>{authError}</p> : null}
                {authInfo ? <p style={{ color: "#0f5132", fontSize: 13, margin: "6px 0 12px" }}>{authInfo}</p> : null}
                {pendingConfirmUsername ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <input ref={codeInputRef} value={authVerificationCode} onChange={(e) => setAuthVerificationCode(e.target.value)} placeholder="Código de verificación" style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${APP_BORDER}`, flex: 1 }} />
                    <button type="button" onClick={(e) => { handleConfirmCode(e); }} style={{ background: "#0f172a", color: "white", border: "none", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700 }}>Confirmar</button>
                    <button type="button" onClick={handleResendCode} disabled={resendCooldown > 0} style={{ background: "#e6eef8", color: "#0f172a", border: "none", borderRadius: 10, padding: "10px 14px", cursor: resendCooldown > 0 ? "not-allowed" : "pointer", fontWeight: 700, opacity: resendCooldown > 0 ? 0.6 : 1 }}>{resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : "Reenviar"}</button>
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
                  <button type="submit" style={{ flex: 1, background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                    {authMode === "register" ? "Crear cuenta y entrar" : "Entrar"}
                  </button>
                  <button type="button" onClick={() => setAuthPanelOpen(false)} style={{ background: "#e6eef8", color: "#0f172a", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

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
                onClick={() => {
                  if (!isAuthenticated) {
                    setPendingRestaurant(r);
                    setAuthMode("login");
                    setAuthError("");
                    setAuthPanelOpen(true);
                    return;
                  }
                  onSelectRestaurant(r);
                }}
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
