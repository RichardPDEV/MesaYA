import React, { useState } from "react";
import { API_BASE_URL, APP_CARD, APP_BORDER, CARD_SHADOW } from "../lib/constants.js";
import { setAccessToken, requestJson } from "../lib/api.js";
import { writeClientSession } from "../lib/storage.js";
import { Label, inputStyle } from "../components/FormFields.jsx";

export default function ClientAuthGate({ onBack, onContinue }) {
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      let registeredUser = null;
      if (authMode === "register") {
        try {
          registeredUser = await requestJson(`${API_BASE_URL}/auth/register`, {
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

      const profileName = loginResp?.displayName || registeredUser?.displayName || authName || authEmail;
      setAccessToken(token);
      writeClientSession({ token, username: authEmail, displayName: profileName, role: loginResp?.role || registeredUser?.role || "USER" });
      onContinue();
    } catch (err) {
      setAuthError(err.message || "No se pudo iniciar sesión");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 480, background: APP_CARD, borderRadius: 24, padding: "32px 28px", boxShadow: CARD_SHADOW, border: `1px solid ${APP_BORDER}` }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", padding: 0, fontSize: 16, marginBottom: 18 }}>← Volver</button>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Acceso de cliente</p>
        <h2 style={{ margin: "8px 0 10px", color: "#0f172a", fontSize: 26, fontWeight: 800 }}>Inicia sesión para reservar</h2>
        <p style={{ margin: "0 0 20px", color: "#64748b", lineHeight: 1.5 }}>Regístrate o entra con tu cuenta para ver restaurantes y confirmar una reserva.</p>

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
          <button type="submit" style={{ width: "100%", background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            {authMode === "register" ? "Crear cuenta" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
