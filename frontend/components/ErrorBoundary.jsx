import React from "react";

export default class ErrorBoundary extends React.Component {
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
