import React, { useEffect, useState } from "react";
import { INITIAL_RESTAURANTS } from "./lib/data.js";
import { API_BASE_URL } from "./lib/constants.js";
import { requestJson } from "./lib/api.js";
import {
  readAccounts,
  writeAccounts,
  readRegisteredRestaurants,
  writeRegisteredRestaurants,
  readRestaurantSession,
  writeRestaurantSession,
} from "./lib/storage.js";
import { mapRestaurantToBackend, buildIsoDateTime, getEndTimeFromStart } from "./lib/restaurantBackend.js";
import { normalizeRestaurantLayout, sameRestaurantId } from "./lib/layout.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import ClientAuthGate from "./pages/ClientAuthGate.jsx";
import ClientHome from "./pages/ClientHome.jsx";
import ClientReservation from "./pages/ClientReservation.jsx";
import RestaurantAuth from "./pages/RestaurantAuth.jsx";
import RestaurantDashboard from "./pages/RestaurantDashboard.jsx";

export default function App() {
  const [restaurants, setRestaurants] = useState(INITIAL_RESTAURANTS);
  const [view, setView] = useState("landing"); // landing | client-home | client-reserve | restaurant-auth | restaurant-dash
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [backendStatus, setBackendStatus] = useState("loading");
  const [restaurantSession, setRestaurantSession] = useState(readRestaurantSession());
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadRestaurants() {
      const registered = readRegisteredRestaurants().map(normalizeRestaurantLayout).filter(Boolean);
      const combined = [...INITIAL_RESTAURANTS, ...registered];

      try {
        const liveRestaurants = await Promise.all(combined.map(mapRestaurantToBackend));
        if (isMounted) {
          setRestaurants(liveRestaurants);
          setBackendStatus("connected");
        }
      } catch (error) {
        if (isMounted) {
          setRestaurants(combined);
          setBackendStatus("fallback");
          console.error("No se pudo conectar con el backend:", error);
        }
      }
    }

    loadRestaurants();
    return () => {
      isMounted = false;
    };
  }, []);

  const syncRestaurantSession = (session) => {
    setRestaurantSession(session);
    writeRestaurantSession(session);
  };

  const handleRestaurantRegister = async (form) => {
    const { name, cuisine, address, phone, email, password, description } = form;
    if (!name || !email || !password || !address) {
      throw new Error("Completa los campos obligatorios");
    }

    const accounts = readAccounts();
    if (accounts.some((account) => account.email === email)) {
      throw new Error("Ya existe una cuenta con ese email");
    }

    let businessId = null;
    let resourceId = null;
    let registrationError = null;

    try {
      const business = await requestJson(`${API_BASE_URL}/v1/businesses`, {
        method: "POST",
        body: JSON.stringify({
          name,
          type: "RESTAURANT",
          cuisine,
          address,
          phone,
          description,
          tableLayoutJson: JSON.stringify([]),
        }),
      });
      businessId = business.id;

      const resource = await requestJson(`${API_BASE_URL}/v1/businesses/${business.id}/resources`, {
        method: "POST",
        body: JSON.stringify({ businessId: business.id, name: `${name} mesa`, capacity: 8 }),
      });
      resourceId = resource.id;
    } catch (error) {
      console.warn("No se pudo crear el negocio/resource en el backend:", error);
      registrationError = error;
    }

    const restaurant = normalizeRestaurantLayout({
      id: Date.now(),
      name,
      cuisine,
      address,
      phone,
      description,
      image: "🍴",
      tables: [],
      reservations: [],
      openTime: "12:00",
      closeTime: "23:00",
      backendBusinessId: businessId,
      backendResourceId: resourceId,
    });

    writeAccounts([...accounts, { email, password, restaurantId: restaurant.id, businessId, resourceId }]);
    writeRegisteredRestaurants([...readRegisteredRestaurants(), restaurant]);
    setRestaurants((prev) => [...prev, restaurant]);

    const session = { email, restaurantId: restaurant.id, businessId, resourceId };
    syncRestaurantSession(session);
    setAuthError("");
    setView("restaurant-dash");

    if (registrationError) {
      console.warn("Registro completado localmente, pero hubo un problema en backend:", registrationError);
    }
  };

  const handleRestaurantLogin = async ({ email, password }) => {
    const accounts = readAccounts();
    const account = accounts.find((item) => item.email === email);
    if (!account || account.password !== password) {
      throw new Error("Email o contraseña incorrectos");
    }

    const registeredRestaurants = readRegisteredRestaurants();
    const restaurant = normalizeRestaurantLayout(
      registeredRestaurants.find((item) => sameRestaurantId(item.id, account.restaurantId))
    );
    if (restaurant && !restaurants.some((r) => sameRestaurantId(r.id, restaurant.id))) {
      setRestaurants((prev) => [...prev, restaurant]);
    }

    const session = { email, restaurantId: account.restaurantId, businessId: account.businessId, resourceId: account.resourceId };
    syncRestaurantSession(session);
    setAuthError("");
    setView("restaurant-dash");
  };

  const handleConfirmReservation = async (data) => {
    const restaurantId = selectedRestaurant?.id;
    const restaurant = restaurants.find((r) => r.id === restaurantId);
    if (!restaurant) return;

    const restaurantWithBackend = restaurant.backendResourceId
      ? restaurant
      : await mapRestaurantToBackend(restaurant);

    if (!restaurantWithBackend?.backendResourceId) {
      throw new Error("No se pudo preparar el restaurante para reservar");
    }

    const startTime = buildIsoDateTime(data.date, data.time);
    const payload = {
      resourceId: data.resourceId || restaurantWithBackend.backendResourceId,
      tableId: data.tableId,
      customerName: data.name,
      customerEmail: data.email,
      partySize: data.guests,
      startTime,
      endTime: getEndTimeFromStart(startTime, 2),
    };

    try {
      const created = await requestJson(`${API_BASE_URL}/v1/reservations`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setRestaurants((prev) =>
        prev.map((r) => {
          if (r.id !== restaurantId) return r;
          return {
            ...r,
            ...restaurantWithBackend,
            tables: (restaurantWithBackend.tables || r.tables).map((t) => (t.id === data.tableId ? { ...t, status: "reserved" } : t)),
            reservations: [
              ...r.reservations,
              {
                id: created?.id?.toString() || `R${Date.now()}`,
                tableId: data.tableId,
                date: data.date,
                time: data.time,
                name: data.name,
                guests: data.guests,
                status: "confirmed",
              },
            ],
          };
        })
      );
      setBackendStatus("connected");
      return created;
    } catch (error) {
      console.error("Reserva en el backend falló:", error);
      setBackendStatus("fallback");
      throw error;
    }
  };

  const logoutRestaurant = () => {
    syncRestaurantSession(null);
    setView("landing");
  };

  const handleSaveRestaurant = (updatedRestaurant) => {
    setRestaurants((prev) => prev.map((r) => (r.id === updatedRestaurant.id ? updatedRestaurant : r)));
    const registered = readRegisteredRestaurants();
    writeRegisteredRestaurants(registered.map((r) => (r.id === updatedRestaurant.id ? updatedRestaurant : r)));
  };

  let content;
  if (view === "landing") {
    content = <LandingPage onEnterClient={() => setView("client-home")} onEnterRestaurant={() => setView("restaurant-auth")} />;
  } else if (view === "client-auth") {
    content = <ClientAuthGate onBack={() => setView("landing")} onContinue={() => setView("client-home")} />;
  } else if (view === "client-home") {
    content = (
      <ClientHome
        restaurants={restaurants}
        onSelectRestaurant={(r) => { setSelectedRestaurant(r); setView("client-reserve"); }}
        onBack={() => setView("landing")}
      />
    );
  } else if (view === "client-reserve") {
    content = (
      <ClientReservation
        restaurant={normalizeRestaurantLayout(
          restaurants.find((r) => sameRestaurantId(r.id, selectedRestaurant?.id)) || selectedRestaurant
        )}
        onBack={() => setView("client-home")}
        onConfirm={handleConfirmReservation}
      />
    );
  } else if (view === "restaurant-auth") {
    content = (
      <RestaurantAuth
        onRegister={handleRestaurantRegister}
        onLogin={handleRestaurantLogin}
        onBack={() => setView("landing")}
        errorMessage={authError}
      />
    );
  } else if (view === "restaurant-dash") {
    content = (
      <RestaurantDashboard
        restaurants={restaurants}
        initialRestaurantId={restaurantSession?.restaurantId}
        onBack={() => setView("landing")}
        onLogout={logoutRestaurant}
        onSaveRestaurant={handleSaveRestaurant}
      />
    );
  }

  return (
    <ErrorBoundary key={view}>
      <div style={{ minHeight: "100vh" }}>
        {content}
      </div>
    </ErrorBoundary>
  );
}
