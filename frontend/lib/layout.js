export function createLayoutElement(type, x, y, floor = 1, customLabel = null, extraProps = {}) {
  const base = {
    id: `EL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    x,
    y,
    floor,
    ...extraProps,
  };

  switch (type) {
    case "door":
      return { ...base, width: 56, height: 24, label: customLabel || base.label || "Puerta" };
    case "window":
      return { ...base, width: 70, height: 24, label: customLabel || base.label || "Ventana" };
    case "stairs":
      return { ...base, width: 64, height: 64, label: customLabel || base.label || "Escaleras" };
    case "floor":
      return { ...base, width: 180, height: 100, level: 2, label: customLabel || base.label || "Piso 2" };
    case "zone":
      return { ...base, width: 92, height: 58, label: customLabel || base.label || "Zona" };
    default:
      return { ...base, width: 92, height: 58 };
  }
}

export function normalizeRestaurantLayout(restaurant) {
  if (!restaurant) return null;
  return {
    ...restaurant,
    tables: restaurant.tables || [],
    layoutElements: restaurant.layoutElements || [],
    reservations: restaurant.reservations || [],
    openTime: restaurant.openTime || "12:00",
    closeTime: restaurant.closeTime || "23:00",
    cuisine: restaurant.cuisine || "",
    address: restaurant.address || "",
    description: restaurant.description || "",
    image: restaurant.image || "🍴",
  };
}

export function sameRestaurantId(a, b) {
  return String(a) === String(b);
}
