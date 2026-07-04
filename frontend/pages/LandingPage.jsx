import React from "react";

export default function LandingPage({ onEnterClient, onEnterRestaurant }) {
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
