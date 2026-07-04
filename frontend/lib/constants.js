export const TABLE_COLORS = {
  available: { bg: "#dcfce7", border: "#16a34a", text: "#15803d", label: "Disponible" },
  occupied:  { bg: "#fee2e2", border: "#dc2626", text: "#b91c1c", label: "Ocupada" },
  reserved:  { bg: "#fef9c3", border: "#ca8a04", text: "#a16207", label: "Reservada" },
};

export const tw = (...cls) => cls.filter(Boolean).join(" ");

export const APP_SURFACE = "#f8fafc";
export const APP_CARD = "#ffffff";
export const APP_TEXT = "#0f172a";
export const APP_MUTED = "#64748b";
export const APP_BORDER = "#e2e8f0";
export const APP_ACCENT = "#f59e0b";
export const CARD_SHADOW = "0 16px 40px rgba(15, 23, 42, 0.08)";
export const CARD_SHADOW_HOVER = "0 24px 56px rgba(15, 23, 42, 0.12)";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
export const SEED_STORAGE_KEY = "mesaYa-backend-seed";
export const RESTAURANT_ACCOUNTS_KEY = "mesaYa-restaurant-accounts";
export const REGISTERED_RESTAURANTS_KEY = "mesaYa-registered-restaurants";
export const RESTAURANT_SESSION_KEY = "mesaYa-restaurant-session";
export const CLIENT_SESSION_KEY = "mesaYa-client-session";
export const SAVE_QUEUE_KEY = "mesaYa-save-queue";
