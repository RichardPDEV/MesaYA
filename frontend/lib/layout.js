export function createLayoutElement(type, x, y, floor = 1, customLabel = null) {
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
