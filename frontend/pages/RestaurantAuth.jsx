import React, { useEffect, useRef, useState } from "react";
import { API_BASE_URL, APP_CARD, APP_BORDER, CARD_SHADOW } from "../lib/constants.js";
import { setAccessToken, requestJson } from "../lib/api.js";
import { Label, inputStyle } from "../components/FormFields.jsx";

export default function RestaurantAuth({ onRegister, onLogin, onBack, errorMessage }) {
  const [mode, setMode] = useState("login");
  const [registerForm, setRegisterForm] = useState({ name: "", cuisine: "", address: "", phone: "", email: "", password: "", description: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [status, setStatus] = useState("");
  const [pendingConfirmUsername, setPendingConfirmUsername] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeRef = useRef(null);

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
      // Instead of immediately calling onRegister, show confirmation input so the restaurant
      // can enter the verification code sent by email. onRegister will be called after confirm.
      setPendingConfirmUsername(registerForm.email.toLowerCase());
      setResendCooldown(30);
      setStatus('Se ha enviado un código de verificación al correo proporcionado. Revisa Mailtrap.');
    } catch (err) {
      setStatus(err.message || "Error al registrar");
    }
  };

  const handleConfirmCode = async (e) => {
    e?.preventDefault?.();
    setStatus("");
    try {
      if (!pendingConfirmUsername) throw new Error('Usuario desconocido para confirmar');
      if (!verificationCode || !verificationCode.trim()) throw new Error('Introduce el código de verificación');
      await requestJson(`${API_BASE_URL}/auth/confirm`, { method: 'POST', body: JSON.stringify({ username: pendingConfirmUsername, code: verificationCode.trim() }) });
      setStatus('Correo verificado correctamente. Redirigiendo...');
      // show success for 2s then proceed to register/redirect to dashboard
      setTimeout(() => {
        // call onRegister and handle possible errors
        Promise.resolve(onRegister(registerForm)).catch((err) => setStatus(err?.message || 'Error al completar registro'));
      }, 2000);
    } catch (err) {
      setStatus(err.message || 'No se pudo confirmar el código');
    }
  };

  const handleResendCode = async () => {
    setStatus("");
    try {
      if (!pendingConfirmUsername) throw new Error('Usuario desconocido para reenviar');
      await requestJson(`${API_BASE_URL}/auth/resend`, { method: 'POST', body: JSON.stringify({ username: pendingConfirmUsername }) });
      setStatus('Código reenviado. Revisa Mailtrap.');
      setResendCooldown(30);
    } catch (err) {
      setStatus(err.message || 'No se pudo reenviar el código');
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
    if (pendingConfirmUsername) setTimeout(() => codeRef.current?.focus?.(), 50);
  }, [pendingConfirmUsername]);

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
            <>
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
            {pendingConfirmUsername ? (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={codeRef} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} placeholder="Código de verificación" style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={handleConfirmCode} style={{ background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "12px 14px", cursor: "pointer", fontWeight: 700 }}>Confirmar</button>
                <button type="button" onClick={handleResendCode} disabled={resendCooldown>0} style={{ background: "#e6eef8", color: "#0f172a", border: "none", borderRadius: 12, padding: "12px 14px", cursor: resendCooldown>0? 'not-allowed':'pointer', fontWeight: 700, opacity: resendCooldown>0?0.6:1 }}>{resendCooldown>0?`Reenviar (${resendCooldown}s)`:'Reenviar'}</button>
              </div>
            ) : null}
            </>
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
