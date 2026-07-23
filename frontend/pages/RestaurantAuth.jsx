import React, { useState } from "react";
import { APP_CARD, APP_BORDER, CARD_SHADOW, API_BASE_URL } from "../lib/constants.js";
import { Label, inputStyle } from "../components/FormFields.jsx";
import { requestJson, setAccessToken } from "../lib/api.js";

export default function RestaurantAuth({ onRegister, onLogin, onBack, errorMessage }) {
  const [mode, setMode] = useState("login");
  const [registerForm, setRegisterForm] = useState({ name: "", cuisine: "", address: "", phone: "", email: "", password: "", description: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [status, setStatus] = useState("");
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState("");
  const [pendingConfirmPassword, setPendingConfirmPassword] = useState("");
  const [pendingRegistrationData, setPendingRegistrationData] = useState(null);
  const [confirmCode, setConfirmCode] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setStatus("");
    try {
      const email = (registerForm.email || "").trim().toLowerCase();
      const password = registerForm.password || "";
      const name = (registerForm.name || "").trim();
      if (!email || !password || !name) {
        throw new Error("Completa los campos obligatorios");
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error("Introduce un email válido para la cuenta del restaurante");
      }

      const payload = await requestJson(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        body: JSON.stringify({ username: email, password, displayName: name }),
      });

      setPendingRegistrationData({ ...registerForm, email, password, name });
      setPendingConfirmEmail(email);
      setPendingConfirmPassword(password);
      setConfirmCode(payload?.confirmationCode || "");
      setMode("confirm");
      setStatus(
        payload?.confirmationCode
          ? `Se generó el código: ${payload.confirmationCode}. Introduce el código para continuar.`
          : "Registro iniciado. Revisa tu correo para el código de confirmación."
      );
    } catch (err) {
      setStatus(err.message || "Error al registrar");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setStatus("");
    try {
      await onLogin(loginForm);
    } catch (err) {
      setStatus(err.message || "Email o contraseña incorrectos");
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setStatus("");
    try {
      if (!pendingConfirmEmail) {
        throw new Error("No hay registro pendiente para confirmar");
      }
      const code = (confirmCode || "").trim();
      if (!code) {
        throw new Error("Introduce el código de confirmación");
      }
      await requestJson(`${API_BASE_URL}/auth/confirm`, {
        method: "POST",
        body: JSON.stringify({ username: pendingConfirmEmail, code }),
      });

      const loginResp = await requestJson(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ username: pendingConfirmEmail, password: pendingConfirmPassword }),
      });
      const token = loginResp?.token;
      if (!token) {
        throw new Error("No se pudo iniciar sesión después de confirmar");
      }
      setAccessToken(token);
      if (!pendingRegistrationData) {
        throw new Error("No hay datos de registro pendientes");
      }
      await onRegister(pendingRegistrationData);
      setStatus("Registro confirmado y restaurante preparado. Redirigiendo...");
      setPendingConfirmEmail("");
      setPendingConfirmPassword("");
      setPendingRegistrationData(null);
      setConfirmCode("");
      setMode("login");
    } catch (err) {
      setStatus(err.message || "No se pudo confirmar el código");
    }
  };

  const handleResend = async () => {
    setStatus("");
    try {
      if (!pendingConfirmEmail) {
        throw new Error("No hay registro pendiente para reenviar");
      }
      await requestJson(`${API_BASE_URL}/auth/resend`, {
        method: "POST",
        body: JSON.stringify({ username: pendingConfirmEmail }),
      });
      setStatus("Código reenviado. Revisa tu correo.");
    } catch (err) {
      setStatus(err.message || "No se pudo reenviar el código");
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
          ) : mode === "confirm" ? (
            <form onSubmit={handleConfirm}>
              <Label>Email</Label>
              <input value={pendingConfirmEmail} readOnly placeholder="correo@restaurante.com" style={{ ...inputStyle, backgroundColor: "#f1f5f9" }} />
              <Label>Código de confirmación</Label>
              <input value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} placeholder="000000" style={inputStyle} />
              <button type="submit" style={{ width: "100%", background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Confirmar registro</button>
              <button type="button" onClick={handleResend} style={{ width: "100%", marginTop: 10, background: "#f8fafc", color: "#0f172a", border: "1px solid #0f172a", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Reenviar código</button>
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
