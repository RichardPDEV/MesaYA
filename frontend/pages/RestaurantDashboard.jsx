import React, { useEffect, useState, useCallback, useRef } from "react";
import { API_BASE_URL, APP_CARD, APP_BORDER, CARD_SHADOW, TABLE_COLORS } from "../lib/constants.js";
import { readSaveQueue, enqueueSaveItem, removeSaveItemAt } from "../lib/storage.js";
import { getAccessToken, requestJson } from "../lib/api.js";
import { persistRestaurantProfile } from "../lib/restaurantBackend.js";
import { createLayoutElement, normalizeRestaurantLayout, sameRestaurantId } from "../lib/layout.js";
import { buildTableOccupancy, summarizeOccupancy } from "../lib/occupancy.js";
import { readRegisteredRestaurants } from "../lib/storage.js";
import Badge from "../components/Badge.jsx";
import FloorPlan from "../components/FloorPlan.jsx";
import { Label, inputStyle } from "../components/FormFields.jsx";

export default function RestaurantDashboard({ restaurants, onBack, onLogout, onSaveRestaurant, initialRestaurantId }) {
  const resolveRestaurants = () => {
    const normalized = (restaurants || []).map(normalizeRestaurantLayout).filter(Boolean);
    if (!initialRestaurantId) return normalized;

    const owned = normalized.filter((r) => sameRestaurantId(r.id, initialRestaurantId));
    if (owned.length) return owned;

    const registered = readRegisteredRestaurants()
      .map(normalizeRestaurantLayout)
      .filter(Boolean)
      .filter((r) => sameRestaurantId(r.id, initialRestaurantId));

    if (registered.length) {
      return [...normalized, ...registered.filter((r) => !normalized.some((item) => sameRestaurantId(item.id, r.id)))];
    }

    return normalized;
  };

  const initialList = resolveRestaurants();
  const [restList, setRestList] = useState(initialList.length ? initialList : resolveRestaurants());
  const [activeRest, setActiveRest] = useState(
    initialList.find((r) => sameRestaurantId(r.id, initialRestaurantId)) || initialList[0] || null
  );
  const [tab, setTab] = useState("overview"); // overview | floorplan | reservations | register

  useEffect(() => {
    const list = resolveRestaurants();
    setRestList(list.length ? list : []);

    const selected =
      list.find((r) => sameRestaurantId(r.id, initialRestaurantId)) ||
      list.find((r) => sameRestaurantId(r.id, activeRest?.id)) ||
      list[0] ||
      null;

    if (selected && (!activeRest || !sameRestaurantId(activeRest.id, selected.id))) {
      setActiveRest(selected);
    } else if (!selected && activeRest && !list.some((r) => sameRestaurantId(r.id, activeRest.id))) {
      setActiveRest(list[0] || null);
    }
  }, [restaurants, initialRestaurantId]);
  const [dragging, setDragging] = useState(null);
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableSeats, setNewTableSeats] = useState(4);
  const [activeFloor, setActiveFloor] = useState(1);
  const [activeElementType, setActiveElementType] = useState(null);
  const [showOnlyTables, setShowOnlyTables] = useState(false);
  const [legendFilter, setLegendFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [capacityFilter, setCapacityFilter] = useState("all");
  const [previewMode, setPreviewMode] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [floorPlanZoom, setFloorPlanZoom] = useState(1);
  const [floorCount, setFloorCount] = useState(1);
  const [floorNames, setFloorNames] = useState({ 1: "Piso principal" });
  const [selectedLayoutElementId, setSelectedLayoutElementId] = useState(null);
  const [lastReservationsSync, setLastReservationsSync] = useState(null);
  const dragIntentRef = useRef(false);
  const stopLayoutAction = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const suppressCreateRef = useRef(false);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [regForm, setRegForm] = useState({ name: "", cuisine: "", address: "", phone: "", description: "" });

  useEffect(() => {
    if (!activeRest) return;
    const floorsFromTables = (activeRest.tables || []).reduce((max, table) => Math.max(max, Number(table.floor) || 1), 1);
    const floorsFromElements = (activeRest.layoutElements || []).reduce((max, element) => {
      if (element.type === "floor") return Math.max(max, Number(element.level) || 1);
      return Math.max(max, Number(element.floor) || 1);
    }, 1);
    const inferredCount = Math.max(1, activeRest.floorCount || 1, floorsFromTables, floorsFromElements);
    setFloorCount((prev) => (prev === inferredCount ? prev : inferredCount));
    setFloorNames((prev) => {
      const next = { ...prev };
      for (let n = 2; n <= inferredCount; n += 1) {
        if (!next[n]) next[n] = `Piso ${n}`;
      }
      return next;
    });
    if (activeFloor > inferredCount) {
      setActiveFloor(inferredCount);
    }
  }, [activeRest?.id, activeRest?.floorCount, activeRest?.tables, activeRest?.layoutElements]);
  const [regDone, setRegDone] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(() => readSaveQueue().length);
  const lastSavedSignatureRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const flushQueue = async () => {
      const q = readSaveQueue();
      if (!q.length) {
        if (mounted) setPendingSaves(0);
        return;
      }
      for (let i = 0; i < q.length; i++) {
        const item = q[i];
        try {
          await persistRestaurantProfile(item.data);
          removeSaveItemAt(i);
          i--;
        } catch (e) {
          console.warn("Queued save failed, will retry later:", e);
        }
      }
      if (mounted) setPendingSaves(readSaveQueue().length);
    };

    const id = setInterval(flushQueue, 5000);
    window.addEventListener("online", flushQueue);
    flushQueue();
    return () => { mounted = false; clearInterval(id); window.removeEventListener("online", flushQueue); };
  }, []);

  const saveRestaurantProfile = async () => {
    if (!activeRest || !onSaveRestaurant) return;
    setIsSaving(true);
    setSaveStatus("Guardando perfil...");

    try {
      const saved = await persistRestaurantProfile(activeRest);
      const updated = {
        ...activeRest,
        backendBusinessId: saved.id || activeRest.backendBusinessId,
        backendResourceId: activeRest.backendResourceId || activeRest.resourceId,
        name: saved.name || activeRest.name,
        cuisine: saved.cuisine || activeRest.cuisine,
        address: saved.address || activeRest.address,
        phone: saved.phone || activeRest.phone,
        description: saved.description || activeRest.description,
      };
      onSaveRestaurant(updated);
      lastSavedSignatureRef.current = JSON.stringify({
        id: updated.id,
        name: updated.name,
        address: updated.address,
        description: updated.description,
        tables: updated.tables || [],
        layoutElements: updated.layoutElements || [],
        reservations: updated.reservations || [],
        floorCount,
        floorNames,
      });
      setSaveStatus("Plano guardado en tu perfil");
    } catch (error) {
      console.error("No se pudo guardar el perfil en el backend:", error);
      // Try one quick retry for transient errors
      try {
        await new Promise(r => setTimeout(r, 400));
        const saved2 = await persistRestaurantProfile(activeRest);
        const updated2 = {
          ...activeRest,
          backendBusinessId: saved2.id || activeRest.backendBusinessId,
          backendResourceId: activeRest.backendResourceId || activeRest.resourceId,
          name: saved2.name || activeRest.name,
          cuisine: saved2.cuisine || activeRest.cuisine,
          address: saved2.address || activeRest.address,
          phone: saved2.phone || activeRest.phone,
          description: saved2.description || activeRest.description,
        };
        onSaveRestaurant(updated2);
        lastSavedSignatureRef.current = JSON.stringify({
          id: updated2.id,
          name: updated2.name,
          address: updated2.address,
          description: updated2.description,
          tables: updated2.tables || [],
          layoutElements: updated2.layoutElements || [],
          reservations: updated2.reservations || [],
          floorCount,
          floorNames,
        });
        setSaveStatus("Plano guardado en tu perfil (reintento exitoso)");
      } catch (err2) {
        // Final fallback: keep local, enqueue save for background retry, and show detailed message
        onSaveRestaurant(activeRest);
        try {
          enqueueSaveItem({ ts: Date.now(), data: activeRest });
          setPendingSaves(readSaveQueue().length);
        } catch (e) {
          console.warn("Failed to enqueue save:", e);
        }
        const details = err2?.payload ? JSON.stringify(err2.payload) : err2?.message || String(err2);
        setSaveStatus(`No se pudo guardar en el backend. Se conserva localmente y se encoló el intento. (${details})`);
      }
    }
    setIsSaving(false);
    setTimeout(() => setSaveStatus(""), 2500);
  };

  useEffect(() => {
    if (!activeRest || !autoSaveEnabled) return;

    const signature = JSON.stringify({
      id: activeRest.id,
      name: activeRest.name,
      address: activeRest.address,
      description: activeRest.description,
      tables: activeRest.tables || [],
      layoutElements: activeRest.layoutElements || [],
      reservations: activeRest.reservations || [],
      floorCount,
      floorNames,
    });

    if (lastSavedSignatureRef.current === signature) return;

    const timer = window.setTimeout(() => {
      lastSavedSignatureRef.current = signature;
      saveRestaurantProfile();
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeRest?.id, activeRest?.name, activeRest?.address, activeRest?.description, activeRest?.tables, activeRest?.layoutElements, activeRest?.reservations, autoSaveEnabled, floorCount, floorNames]);

  const syncRest = useCallback((updated) => {
    setRestList(prev => prev.map(r => r.id === updated.id ? updated : r));
    setActiveRest(updated);
  }, []);

  const updateTableStatus = (tableId, status) => {
    const updated = { ...activeRest, tables: (activeRest.tables || []).map(t => t.id === tableId ? { ...t, status } : t) };
    syncRest(updated);
  };

  const updateTableNotes = (tableId, notes) => {
    const updated = { ...activeRest, tables: (activeRest.tables || []).map(t => t.id === tableId ? { ...t, notes } : t) };
    syncRest(updated);
  };

  const cycleTableStatus = (currentStatus) => {
    const order = ["available", "occupied", "reserved"];
    const nextIndex = (order.indexOf(currentStatus) + 1) % order.length;
    return order[nextIndex] || "available";
  };

  const handleTableClick = (table) => {
    const nextStatus = cycleTableStatus(table.status);
    updateTableStatus(table.id, nextStatus);
  };

  const addTable = () => {
    const currentTables = activeRest?.tables || [];
    const ids = currentTables.map(t => parseInt(t.id.replace("T", ""))).filter(Boolean).sort((a, b) => b - a);
    const nextId = `T${(ids[0] || 0) + 1}`;
    const newTable = { id: nextId, label: nextId, x: 120 + Math.random() * 260, y: 100 + Math.random() * 160, seats: newTableSeats, status: "available", floor: activeFloor, notes: "" };
    const updated = { ...activeRest, tables: [...currentTables, newTable] };
    syncRest(updated);
    setActiveRest(updated);
    setShowAddTable(false);
  };

  const addLayoutElement = (type, x, y, extraProps = {}) => {
    if (!activeRest) return;
    const updated = { ...activeRest, layoutElements: [...(activeRest.layoutElements || []), createLayoutElement(type, x, y, activeFloor, null, extraProps)] };
    syncRest(updated);
    setActiveRest(updated);
  };

  const getLayoutElementLabel = (element) => {
    if (element?.label && element.label.trim()) return element.label.trim();
    switch (element?.type) {
      case "door": return "Puerta";
      case "window": return "Ventana";
      case "stairs": return "Escaleras";
      case "floor": return "Piso";
      default: return "Elemento";
    }
  };

  const updateLayoutElementLabel = (elementId, value) => {
    if (!activeRest) return;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => element.id === elementId ? { ...element, label: value } : element) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const updateLayoutElementSubtype = (elementId, subtype) => {
    if (!activeRest) return;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => element.id === elementId ? { ...element, subtype } : element) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const createFloorPlanBlock = () => {
    if (!activeRest) return;
    const nextFloor = floorCount + 1;
    const response = window.prompt("Nombre del piso", `Piso ${nextFloor}`);
    if (response === null) return;
    const name = response.trim() || `Piso ${nextFloor}`;
    setFloorCount(nextFloor);
    setFloorNames((prev) => ({ ...prev, [nextFloor]: name }));
    setActiveFloor(nextFloor);
    setActiveElementType(null);
    setSelectedTableId(null);
  };

  const duplicateFloorPlan = (floorToDuplicate) => {
    if (!activeRest) return;
    const nextFloor = floorCount + 1;
    const sourceName = floorNames[floorToDuplicate] || `Piso ${floorToDuplicate}`;
    const response = window.prompt("Nombre del piso duplicado", `${sourceName} (copia)`);
    if (response === null) return;
    const name = response.trim() || `${sourceName} (copia)`;

    const clonedTables = (activeRest.tables || [])
      .filter((table) => (table.floor || 1) === floorToDuplicate)
      .map((table) => ({ ...table, id: `${table.id}-copy-${nextFloor}`, floor: nextFloor, x: Math.min(500, (table.x || 120) + 32), y: Math.min(320, (table.y || 120) + 32), notes: table.notes || "" }));

    const clonedElements = (activeRest.layoutElements || [])
      .filter((element) => {
        if (element.type === "floor") return (element.level || 1) === floorToDuplicate;
        return (element.floor || 1) === floorToDuplicate;
      })
      .map((element) => ({ ...element, id: `${element.id}-copy-${nextFloor}`, floor: nextFloor, level: nextFloor, x: Math.min(500, (element.x || 120) + 24), y: Math.min(320, (element.y || 120) + 24) }));

    const updated = {
      ...activeRest,
      tables: [...(activeRest.tables || []), ...clonedTables],
      layoutElements: [...(activeRest.layoutElements || []), ...clonedElements],
    };

    syncRest(updated);
    setFloorCount(nextFloor);
    setFloorNames((prev) => ({ ...prev, [nextFloor]: name }));
    setActiveFloor(nextFloor);
    setSelectedTableId(null);
    setSelectedLayoutElementId(null);
  };

  const removeFloorPlan = (floorToRemove) => {
    if (!activeRest) return;
    if (floorToRemove === 1) return;
    const confirmDelete = window.confirm(`¿Eliminar el piso ${floorNames[floorToRemove] || `Piso ${floorToRemove}`}?`);
    if (!confirmDelete) return;

    const nextFloor = Math.max(1, floorToRemove - 1);
    const updatedTables = (activeRest.tables || []).map((table) => {
      if ((table.floor || 1) !== floorToRemove) return table;
      return { ...table, floor: 1 };
    });
    const updatedLayoutElements = (activeRest.layoutElements || []).filter((element) => {
      if (element.type === "floor") {
        return (element.level || 1) !== floorToRemove;
      }
      return (element.floor || 1) !== floorToRemove;
    });
    const updated = { ...activeRest, tables: updatedTables, layoutElements: updatedLayoutElements };
    syncRest(updated);
    setActiveFloor(nextFloor);
    setFloorCount((prev) => Math.max(1, prev - 1));
    setFloorNames((prev) => {
      const next = { ...prev };
      delete next[floorToRemove];
      return next;
    });
    setSelectedTableId(null);
  };

  const removeLayoutElement = (elementId) => {
    if (!activeRest) return;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).filter((element) => element.id !== elementId) };
    syncRest(updated);
    setActiveRest(updated);
    if (selectedLayoutElementId === elementId) {
      setSelectedLayoutElementId(null);
    }
  };

  const rotateLayoutElement = (elementId) => {
    if (!activeRest) return;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => {
      if (element.id !== elementId) return element;
      const nextRotation = ((element.rotation || 0) + 90) % 360;
      return { ...element, rotation: nextRotation };
    }) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const updateTableFloor = (tableId, floor) => {
    const updated = { ...activeRest, tables: activeRest.tables.map((table) => table.id === tableId ? { ...table, floor } : table) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const updateLayoutElementSize = (elementId, value) => {
    if (!activeRest) return;
    const parsed = Number.parseInt(value, 10);
    const nextValue = Number.isFinite(parsed) ? Math.min(64, Math.max(24, parsed)) : 24;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => {
      if (element.id !== elementId) return element;
      return { ...element, width: nextValue };
    }) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const handleLayoutElementSizeInputChange = (elementId, value) => {
    if (!activeRest) return;
    if (value === "") return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const updated = { ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => {
      if (element.id !== elementId) return element;
      return { ...element, width: parsed };
    }) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const updateTableSize = (tableId, size) => {
    if (!activeRest) return;
    const parsed = Number.parseInt(size, 10);
    const nextSize = Number.isFinite(parsed) ? Math.min(64, Math.max(24, parsed)) : 24;
    const updated = { ...activeRest, tables: activeRest.tables.map((table) => table.id === tableId ? { ...table, size: nextSize } : table) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const handleTableSizeInputChange = (tableId, value) => {
    if (!activeRest) return;
    if (value === "") return;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const updated = { ...activeRest, tables: activeRest.tables.map((table) => table.id === tableId ? { ...table, size: parsed } : table) };
    syncRest(updated);
    setActiveRest(updated);
  };

  const removeTable = (tableId) => {
    if (!activeRest) return;
    const confirmed = window.confirm("¿Eliminar esta mesa del plano?");
    if (!confirmed) return;
    const updated = { ...activeRest, tables: activeRest.tables.filter(t => t.id !== tableId) };
    syncRest(updated);
    setSelectedTableId(null);
  };

  const handleSvgDrop = useCallback((e) => {
    if (!dragging || !activeRest) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const vbW = 540, vbH = 360;
    const x = ((e.clientX - rect.left) / rect.width) * vbW;
    const y = ((e.clientY - rect.top) / rect.height) * vbH;

    if (dragging.kind === "table") {
      syncRest({ ...activeRest, tables: activeRest.tables.map(t => t.id === dragging.id ? { ...t, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : t) });
    } else if (dragging.kind === "element") {
      syncRest({ ...activeRest, layoutElements: (activeRest.layoutElements || []).map((element) => element.id === dragging.id ? { ...element, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : element) });
    }

    suppressCreateRef.current = true;
    dragIntentRef.current = false;
    setDragging(null);
  }, [dragging, activeRest]);

  const handleSvgMouseMove = useCallback((e) => {
    if (!dragging || !activeRest) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const vbW = 540, vbH = 360;
    const x = ((e.clientX - rect.left) / rect.width) * vbW;
    const y = ((e.clientY - rect.top) / rect.height) * vbH;

    if (dragging.kind === "table") {
      suppressCreateRef.current = true;
      setRestList(prev => prev.map(r => r.id === activeRest.id ? { ...r, tables: r.tables.map(t => t.id === dragging.id ? { ...t, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : t) } : r));
      setActiveRest(prev => ({ ...prev, tables: prev.tables.map(t => t.id === dragging.id ? { ...t, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : t) }));
    } else if (dragging.kind === "element") {
      suppressCreateRef.current = true;
      setRestList(prev => prev.map(r => r.id === activeRest.id ? { ...r, layoutElements: (r.layoutElements || []).map((element) => element.id === dragging.id ? { ...element, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : element) } : r));
      setActiveRest(prev => ({ ...prev, layoutElements: (prev.layoutElements || []).map((element) => element.id === dragging.id ? { ...element, x: Math.max(40, Math.min(500, x)), y: Math.max(40, Math.min(320, y)) } : element) }));
    }
  }, [dragging, activeRest]);

  const handleFloorPlanClick = (e) => {
    setSelectedLayoutElementId(null);

    if (!activeElementType || dragging) {
      if (suppressCreateRef.current) {
        suppressCreateRef.current = false;
      }
      return;
    }
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const vbW = 540, vbH = 360;
    const x = ((e.clientX - rect.left) / rect.width) * vbW;
    const y = ((e.clientY - rect.top) / rect.height) * vbH;

    if (dragIntentRef.current || suppressCreateRef.current) {
      dragIntentRef.current = false;
      suppressCreateRef.current = false;
      return;
    }

    addLayoutElement(activeElementType, x, y);
  };

  const filteredTables = (activeRest?.tables || []).filter((table) => {
    const floorMatch = floorFilter === "all" || Number(table.floor || 1) === Number(floorFilter);
    const statusMatch = legendFilter === "all" || !legendFilter || table.status === legendFilter;
    const capacityMatch = capacityFilter === "all"
      || (capacityFilter === "small" && Number(table.seats) <= 2)
      || (capacityFilter === "medium" && Number(table.seats) <= 4)
      || (capacityFilter === "large" && Number(table.seats) >= 6);
    return floorMatch && statusMatch && capacityMatch;
  });
  const visibleTables = filteredTables.filter((table) => (table.floor || 1) === activeFloor);
  const visibleLayoutElements = (activeRest?.layoutElements || []).filter((element) => {
    if (element.type === "floor") return (element.level || 1) === activeFloor;
    return (element.floor || 1) === activeFloor;
  });
  const selectedTable = visibleTables.find((table) => table.id === selectedTableId) || null;
  const selectedLayoutElement = (activeRest?.layoutElements || []).find((element) => element.id === selectedLayoutElementId) || null;
  const getElementLabelLines = (element) => {
    return [getLayoutElementLabel(element)];
  };

  const getElementBoxMetrics = (element) => {
    const label = getLayoutElementLabel(element);
    const width = Math.max(40, Math.min(120, 12 + label.length * 6));
    return { width, height: 24 };
  };

  const stats = {
    total: (activeRest?.tables || []).length,
    available: (activeRest?.tables || []).filter(t => t.status === "available").length,
    occupied: (activeRest?.tables || []).filter(t => t.status === "occupied").length,
    reserved: (activeRest?.tables || []).filter(t => t.status === "reserved").length,
    people: (activeRest?.tables || []).reduce((sum, table) => sum + Number(table.seats || 0), 0),
  };

  if (!activeRest) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: 24 }}>
        <div style={{ background: "white", borderRadius: 16, padding: "32px 28px", textAlign: "center", maxWidth: 420, border: "1px solid #e2e8f0" }}>
          <p style={{ margin: "0 0 16px", color: "#64748b" }}>No se encontró tu restaurante. Vuelve a iniciar sesión.</p>
          <button onClick={onBack} style={{ background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "12px 20px", cursor: "pointer", fontWeight: 700 }}>
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const activeTables = activeRest.tables || [];
  const activeReservations = activeRest.reservations || [];
  const sortedReservations = [...activeReservations].sort((a, b) => {
    const dateA = `${a?.date || ""}T${a?.time || "00:00"}`;
    const dateB = `${b?.date || ""}T${b?.time || "00:00"}`;
    return dateA.localeCompare(dateB);
  });
  const today = new Date().toISOString().split("T")[0];
  const todaysReservations = sortedReservations.filter((res) => res?.date === today);
  const upcomingReservations = sortedReservations.filter((res) => (res?.date || "") >= today && res?.date !== today);
  const reservationGroups = sortedReservations.reduce((groups, reservation) => {
    const key = reservation?.date || today;
    if (!groups[key]) groups[key] = [];
    groups[key].push(reservation);
    return groups;
  }, {});

  const registerRestaurant = () => {
    const newR = { id: Date.now(), ...regForm, image: "🍴", tables: [], reservations: [], openTime: "12:00", closeTime: "23:00" };
    setRestList(prev => [...prev, newR]);
    setActiveRest(newR);
    setRegDone(true);
    setTimeout(() => { setRegDone(false); setTab("overview"); }, 2500);
  };

  const restaurantTables = activeRest?.tables || [];
  const restaurantElements = activeRest?.layoutElements || [];

  useEffect(() => {
    if (!activeRest) return;

    const resourceId = activeRest.backendResourceId || activeRest.resourceId;
    if (!resourceId) return;

    let cancelled = false;
    const refreshReservations = async () => {
      try {
        const reservations = await requestJson(`${API_BASE_URL}/api/resources/${resourceId}/reservations?date=${today}`);
        if (cancelled) return;

        const now = new Date();
        const nextTables = buildTableOccupancy(activeRest.tables || [], reservations || [], { now, guests: 1 });

        const nextRest = { ...activeRest, tables: nextTables, reservations: reservations || [] };
        syncRest(nextRest);
        setLastReservationsSync(new Date());
      } catch (error) {
        console.warn("No se pudo refrescar reservas del restaurante:", error);
      }
    };

    refreshReservations();
    const intervalId = window.setInterval(refreshReservations, 10000);

    let eventSource = null;
    let reconnectTimer = null;
    const connectStream = () => {
      if (!resourceId || typeof window === "undefined") return;
      const token = getAccessToken();
      const streamUrl = token
        ? `${API_BASE_URL}/api/resources/${resourceId}/events?token=${encodeURIComponent(token)}`
        : `${API_BASE_URL}/api/resources/${resourceId}/events`;
      try {
        eventSource = new EventSource(streamUrl);
        eventSource.addEventListener("reservation-change", () => {
          refreshReservations();
        });
        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
          }
          eventSource = null;
          if (reconnectTimer) {
            window.clearTimeout(reconnectTimer);
          }
          reconnectTimer = window.setTimeout(connectStream, 4000);
        };
      } catch {
        eventSource = null;
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
        }
        reconnectTimer = window.setTimeout(connectStream, 4000);
      }
    };

    connectStream();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [activeRest?.id, activeRest?.backendResourceId, activeRest?.resourceId, syncRest, today]);
  const getFloorLabel = (floorValue) => {
    const floorNumber = Number(floorValue) || 1;
    return floorNames[floorNumber] || (floorNumber === 1 ? "Piso principal" : `Piso ${floorNumber}`);
  };

  const occupancySummary = summarizeOccupancy(restaurantTables);

  const overviewItems = [
    ...restaurantElements.filter((element) => element.type === "door").map((element) => ({
      key: `${element.id}-door`,
      kind: "door",
      icon: "🚪",
      title: "Puerta",
      subtitle: `${getFloorLabel(element.floor || element.level || 1)} · x ${Math.round(element.x)}, y ${Math.round(element.y)}`,
      floorOrder: Number(element.floor || element.level || 1),
    })),
    ...restaurantElements.filter((element) => element.type === "window").map((element) => ({
      key: `${element.id}-window`,
      kind: "window",
      icon: "🪟",
      title: "Ventana",
      subtitle: `${getFloorLabel(element.floor || element.level || 1)} · x ${Math.round(element.x)}, y ${Math.round(element.y)}`,
      floorOrder: Number(element.floor || element.level || 1),
    })),
    ...restaurantElements.filter((element) => element.type === "stairs").map((element) => ({
      key: `${element.id}-stairs`,
      kind: "stairs",
      icon: "🪜",
      title: "Escaleras",
      subtitle: `${getFloorLabel(element.floor || element.level || 1)} · x ${Math.round(element.x)}, y ${Math.round(element.y)}`,
      floorOrder: Number(element.floor || element.level || 1),
    })),
    ...restaurantElements.filter((element) => element.type === "floor").map((element) => ({
      key: `${element.id}-floor`,
      kind: "floor",
      icon: "🏢",
      title: element.label || "Piso",
      subtitle: `${getFloorLabel(element.level || 1)} · x ${Math.round(element.x)}, y ${Math.round(element.y)}`,
      floorOrder: Number(element.level || 1),
    })),
    ...restaurantTables.map((table) => ({
      key: `${table.id}-table`,
      kind: "table",
      icon: "🪑",
      title: `Mesa ${table.label}`,
      subtitle: `${table.seats} personas · ${getFloorLabel(table.floor || 1)} · x ${Math.round(table.x)}, y ${Math.round(table.y)}`,
      floorOrder: Number(table.floor || 1),
    })),
  ].sort((a, b) => a.floorOrder - b.floorOrder || a.title.localeCompare(b.title));

  const elementCounts = {
    doors: restaurantElements.filter((element) => element.type === "door").length,
    windows: restaurantElements.filter((element) => element.type === "window").length,
    stairs: restaurantElements.filter((element) => element.type === "stairs").length,
    floors: restaurantElements.filter((element) => element.type === "floor").length || Math.max(1, floorCount),
    tables: restaurantTables.length,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ width: 240, background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)", display: "flex", flexDirection: "column", flexShrink: 0, boxShadow: "8px 0 24px rgba(2, 6, 23, 0.12)" }}>
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ color: "#f59e0b", fontWeight: 800, fontSize: 20, margin: "0 0 4px" }}>🍽️ MesaYa</p>
          <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>Panel de restaurante</p>
        </div>

        {/* Restaurant selector */}
        <div style={{ padding: "12px 12px 4px" }}>
          <p style={{ color: "#475569", fontSize: 11, fontWeight: 600, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Mi restaurante</p>
          {restList.map(r => (
            <div key={r.id} style={{ width: "100%", textAlign: "left", background: "#1e293b", borderRadius: 10, padding: "10px 12px", color: "white", marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
              <span>{r.image}</span>
              <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Nav */}
        <nav style={{ padding: "12px" }}>
          {[
            { key: "overview", icon: "📊", label: "Resumen" },
            { key: "floorplan", icon: "🗺️", label: "Plano" },
            { key: "reservations", icon: "📅", label: "Reservas" },
            { key: "register", icon: "➕", label: "Nuevo restaurante" },
          ].map(n => (
            <button key={n.key} onClick={() => setTab(n.key)}
              style={{ width: "100%", textAlign: "left", background: tab === n.key ? "#f59e0b22" : "transparent", border: tab === n.key ? "1px solid #f59e0b44" : "1px solid transparent", borderRadius: 10, padding: "10px 14px", color: tab === n.key ? "#f59e0b" : "#94a3b8", cursor: "pointer", marginBottom: 4, display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>

      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Topbar */}
        <div style={{ background: "linear-gradient(90deg, #ffffff 0%, #f8fafc 100%)", borderBottom: "1.5px solid #e2e8f0", padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{activeRest.name}</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>{activeRest.address}</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ background: "#f0fdf4", color: "#15803d", border: "1.5px solid #86efac", borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 700 }}>
              🟢 Abierto · {activeRest.openTime}–{activeRest.closeTime}
            </span>
            <button onClick={onLogout} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 999, color: "#475569", padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, boxShadow: "0 6px 18px rgba(15, 23, 42, 0.05)" }}>
              Cerrar sesión
            </button>
          </div>
        </div>

        <div style={{ padding: "28px" }}>

          {/* OVERVIEW */}
          {tab === "overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 28 }}>
                {[
                  { label: "Total mesas", value: stats.total, color: "#6366f1", bg: "#eef2ff" },
                  { label: "Disponibles", value: stats.available, color: "#16a34a", bg: "#dcfce7" },
                  { label: "Ocupadas", value: stats.occupied, color: "#dc2626", bg: "#fee2e2" },
                  { label: "Reservadas", value: stats.reserved, color: "#ca8a04", bg: "#fef9c3" },
                ].map(s => (
                  <div key={s.label} style={{ background: APP_CARD, border: `1.5px solid ${APP_BORDER}`, borderRadius: 16, padding: "20px 20px 16px", borderTop: `4px solid ${s.color}`, boxShadow: CARD_SHADOW }}>
                    <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 13 }}>{s.label}</p>
                    <p style={{ margin: 0, fontSize: 36, fontWeight: 800, color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>

              <div style={{ background: APP_CARD, border: `1.5px solid ${APP_BORDER}`, borderRadius: 18, padding: "22px 22px 20px", boxShadow: CARD_SHADOW, marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>Plano del restaurante</h3>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Cada piso se muestra como un plano estático con las mesas y sus estados.</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      onClick={() => setShowOnlyTables((value) => !value)}
                      style={{ background: showOnlyTables ? "#0f172a" : "white", border: "1px solid #e2e8f0", borderRadius: 999, color: showOnlyTables ? "white" : "#334155", padding: "8px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                    >
                      {showOnlyTables ? "Ver completo" : "Ver solo mesas"}
                    </button>
                    <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 999, padding: "8px 12px", fontSize: 13, background: "white" }}>
                      <option value="all">Todos los pisos</option>
                      {Array.from({ length: floorCount }, (_, index) => index + 1).map((floorNumber) => (
                        <option key={floorNumber} value={floorNumber}>{getFloorLabel(floorNumber)}</option>
                      ))}
                    </select>
                    <select value={capacityFilter} onChange={(e) => setCapacityFilter(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 999, padding: "8px 12px", fontSize: 13, background: "white" }}>
                      <option value="all">Todas las capacidades</option>
                      <option value="small">Hasta 2 personas</option>
                      <option value="medium">Hasta 4 personas</option>
                      <option value="large">6+ personas</option>
                    </select>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {[
                        { key: "all", label: "Todo", color: "#94a3b8" },
                        { key: "available", label: "Disponibles", color: "#16a34a" },
                        { key: "occupied", label: "Ocupadas", color: "#dc2626" },
                        { key: "reserved", label: "Reservadas", color: "#ca8a04" },
                      ].map((item) => (
                        <button
                          key={String(item.key)}
                          onClick={() => setLegendFilter(item.key)}
                          style={{
                            background: legendFilter === item.key ? item.color : "white",
                            color: legendFilter === item.key ? "white" : "#334155",
                            border: legendFilter === item.key ? "1px solid transparent" : "1px solid #e2e8f0",
                            borderRadius: 999,
                            padding: "8px 12px",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {[
                      { label: "Puertas", value: elementCounts.doors, color: "#16a34a" },
                      { label: "Ventanas", value: elementCounts.windows, color: "#3b82f6" },
                      { label: "Escaleras", value: elementCounts.stairs, color: "#f59e0b" },
                      { label: "Mesas", value: elementCounts.tables, color: "#8b5cf6" },
                      { label: "Pisos", value: elementCounts.floors, color: "#64748b" },
                    ].map((item) => (
                      <div key={item.label} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "7px 11px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{item.label}: {item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 18, alignItems: "start" }}>
                  {Array.from({ length: floorCount }, (_, index) => index + 1).map((floorNumber) => {
                    const floorTables = filteredTables.filter((table) => (table.floor || 1) === floorNumber);
                    const floorStats = {
                      available: floorTables.filter((table) => table.status === "available").length,
                      occupied: floorTables.filter((table) => table.status === "occupied").length,
                      reserved: floorTables.filter((table) => table.status === "reserved").length,
                      people: floorTables.reduce((sum, table) => sum + Number(table.seats || 0), 0),
                    };

                    return (
                      <div key={floorNumber} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: "100%", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)" }}>
                        <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{getFloorLabel(floorNumber)}</p>
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>{floorTables.length} mesas · {floorStats.people} personas · {floorTables.length ? `${floorStats.available} libres` : "sin mesas"}</p>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>✓ {floorStats.available}</span>
                            <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>● {floorStats.occupied}</span>
                            <span style={{ background: "#fef9c3", color: "#a16207", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>◐ {floorStats.reserved}</span>
                          </div>
                        </div>
                        <FloorPlan
                          tables={activeTables}
                          onTableClick={handleTableClick}
                          editable={false}
                          layoutElements={activeRest.layoutElements || []}
                          floor={floorNumber}
                          showLegend={false}
                          title={getFloorLabel(floorNumber)}
                          showOnlyTables={showOnlyTables}
                          statusFilter={legendFilter}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>Control de mesas</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {filteredTables.map(table => (
                    <div key={table.id} style={{ background: "white", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>{table.label}</span>
                        <Badge status={table.status} />
                      </div>
                      <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 13 }}>{table.seats} personas · {table.status === "available" ? "Libre" : table.status === "occupied" ? "Ocupada" : "Reservada"}</p>
                      <div style={{ marginBottom: 8 }}>
                        <button
                          onClick={() => { setActiveFloor(table.floor || 1); setSelectedTableId(table.id); }}
                          style={{ width: "100%", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          {`Piso: ${floorNames[table.floor || 1] || (table.floor === 1 ? "Piso principal" : `Piso ${table.floor || 1}`)}`}
                        </button>
                      </div>
                      <select value={table.status} onChange={e => updateTableStatus(table.id, e.target.value)}
                        style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#f8fafc" }}>
                        <option value="available">Disponible</option>
                        <option value="occupied">Ocupada</option>
                        <option value="reserved">Reservada</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* FLOOR PLAN EDITOR */}
          {tab === "floorplan" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Editor del plano</h2>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Arrastra las mesas para reorganizarlas. Cambia su estado con los controles.</p>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={() => setPreviewMode((value) => !value)} style={{ background: previewMode ? "#0f172a" : "white", color: previewMode ? "white" : "#0f172a", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {previewMode ? "Cerrar vista previa" : "Vista previa cliente"}
                  </button>
                  <button onClick={() => setAutoSaveEnabled((value) => !value)} style={{ background: autoSaveEnabled ? "#fef3c7" : "#e2e8f0", color: autoSaveEnabled ? "#92400e" : "#334155", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {autoSaveEnabled ? "Auto-guardado ON" : "Auto-guardado OFF"}
                  </button>
                  <button onClick={() => setFloorPlanZoom((value) => Math.max(0.8, Math.min(1.7, value + 0.1)))} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    + Zoom
                  </button>
                  <button onClick={() => setFloorPlanZoom(1)} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Ajustar
                  </button>
                  <button onClick={() => setShowAddTable(true)}
                    style={{ background: "#0f172a", color: "white", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    + Añadir mesa
                  </button>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <button onClick={saveRestaurantProfile} disabled={isSaving}
                      style={{ background: isSaving ? "#94d3a2" : "#16a34a", color: "white", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: isSaving ? "not-allowed" : "pointer" }}>
                      {isSaving ? "Guardando..." : "Guardar plano"}
                    </button>
                    {pendingSaves > 0 && (
                      <div style={{ position: "absolute", top: -8, right: -8, background: "#f59e0b", color: "white", borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 700 }}>{pendingSaves}</div>
                    )}
                  </div>
                </div>
              </div>
              {saveStatus && (
                <div style={{ marginBottom: 18, color: "#16a34a", fontSize: 14, fontWeight: 600 }}>{saveStatus}</div>
              )}

              {showAddTable && (
                <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1e40af" }}>Sillas:</span>
                  {[2, 4, 6, 8].map(n => (
                    <button key={n} onClick={() => setNewTableSeats(n)}
                      style={{ padding: "8px 18px", borderRadius: 10, border: newTableSeats === n ? "2px solid #2563eb" : "1.5px solid #bfdbfe", background: newTableSeats === n ? "#2563eb" : "white", color: newTableSeats === n ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                      {n}p
                    </button>
                  ))}
                  {floorCount > 1 ? (
                    <>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#1e40af" }}>Piso:</span>
                      {Array.from({ length: floorCount }, (_, index) => index + 1).map(n => (
                        <button key={n} onClick={() => setActiveFloor(n)} style={{ padding: "8px 14px", borderRadius: 10, border: activeFloor === n ? "2px solid #2563eb" : "1.5px solid #bfdbfe", background: activeFloor === n ? "#2563eb" : "white", color: activeFloor === n ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                          {floorNames[n] || (n === 1 ? "Piso principal" : `Piso ${n}`)}
                        </button>
                      ))}
                    </>
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#1e40af" }}>Se asignará al piso principal</span>
                  )}
                  <button onClick={addTable} style={{ background: "#16a34a", color: "white", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, cursor: "pointer" }}>Crear</button>
                  <button onClick={() => setShowAddTable(false)} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 }}>Cancelar</button>
                </div>
              )}

              <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", marginBottom: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Ver piso:</span>
                {Array.from({ length: floorCount }, (_, index) => index + 1).map((floor) => (
                  <div key={floor} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => { setActiveFloor(floor); setSelectedTableId(null); }} style={{ padding: "8px 12px", borderRadius: 10, border: activeFloor === floor ? "2px solid #0f172a" : "1px solid #e2e8f0", background: activeFloor === floor ? "#0f172a" : "white", color: activeFloor === floor ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                      {floorNames[floor] || (floor === 1 ? "Piso principal" : `Piso ${floor}`)}
                    </button>
                    {floor > 1 && (
                      <>
                        <button onClick={() => duplicateFloorPlan(floor)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 700, cursor: "pointer" }} title="Duplicar piso">
                          ⧉
                        </button>
                        <button onClick={() => removeFloorPlan(floor)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontWeight: 700, cursor: "pointer" }} title="Eliminar piso">
                          ×
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Añadir referencia:</span>
                {[
                  { key: "door", label: "Puerta" },
                  { key: "window", label: "Ventana" },
                  { key: "stairs", label: "Escaleras" },
                  { key: "zone", label: "Zona" },
                  { key: "floor", label: "Crear piso" },
                ].map(item => (
                  <button key={item.key} onClick={() => {
                    if (item.key === "floor") {
                      createFloorPlanBlock();
                    } else {
                      setActiveElementType(activeElementType === item.key ? null : item.key);
                    }
                  }} style={{ padding: "8px 12px", borderRadius: 10, border: activeElementType === item.key ? "2px solid #0f172a" : "1px solid #e2e8f0", background: activeElementType === item.key ? "#0f172a" : "white", color: activeElementType === item.key ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                    {item.label}
                  </button>
                ))}
                <span style={{ fontSize: 13, color: "#64748b" }}>Haz clic en el plano para colocar el elemento seleccionado.</span>
              </div>

              {previewMode && (
                <div style={{ background: "white", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Vista previa para el cliente</p>
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Así se vería el plano con el estado actual de las mesas.</p>
                    </div>
                    <span style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>Modo cliente</span>
                  </div>
                  <FloorPlan
                    tables={activeTables}
                    onTableClick={null}
                    editable={false}
                    layoutElements={activeRest.layoutElements || []}
                    floor={activeFloor}
                    showLegend={true}
                    title={getFloorLabel(activeFloor)}
                    showOnlyTables={showOnlyTables}
                    statusFilter={legendFilter}
                  />
                </div>
              )}

              {/* Editable SVG floor plan */}
              <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ overflow: "auto" }}>
                  <div style={{ transform: `scale(${floorPlanZoom})`, transformOrigin: "top left", width: `${100 / floorPlanZoom}%`, minWidth: `${100 / floorPlanZoom}%` }}>
                <svg
                  width="100%"
                  viewBox="0 0 540 360"
                  style={{ display: "block", cursor: activeElementType ? "crosshair" : "default" }}
                  onClick={handleFloorPlanClick}
                  onMouseMove={handleSvgMouseMove}
                  onMouseUp={handleSvgDrop}
                  onMouseLeave={() => setDragging(null)}
                >
                  <defs>
                    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="540" height="360" fill="url(#grid)" />
                  <text x="270" y="20" textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="600">PLANO EDITABLE — arrastra mesas y elementos</text>

                  {visibleLayoutElements.length === 0 && visibleTables.length === 0 && (
                    <text x="270" y="190" textAnchor="middle" fontSize="13" fill="#94a3b8">Plano vacío para {floorNames[activeFloor] || `Piso ${activeFloor}`}</text>
                  )}

                  {visibleLayoutElements.map((element) => {
                    const color = element.type === "door" ? "#34d399" : element.type === "window" ? "#60a5fa" : element.type === "stairs" ? "#f59e0b" : "#cbd5e1";
                    const rotation = element.rotation || 0;
                    const isSelected = selectedLayoutElementId === element.id;
                    if (element.type === "floor") {
                      return (
                        <g key={element.id} transform={`rotate(${rotation} ${element.x} ${element.y})`} onMouseDown={(e) => { e.stopPropagation(); suppressCreateRef.current = true; dragIntentRef.current = true; setSelectedLayoutElementId(element.id); setDragging({ kind: "element", id: element.id }); }} onClick={(e) => { e.stopPropagation(); setSelectedLayoutElementId(element.id); }}>
                          <rect x={element.x - (element.width || 140) / 2} y={element.y - (element.height || 90) / 2} width={element.width || 140} height={element.height || 90} rx={16} fill="#f8fafc" stroke="#94a3b8" strokeDasharray="6 4" />
                          <text x={element.x} y={element.y - 3} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#475569">{element.label || "Piso superior"}</text>
                          <text x={element.x} y={element.y + 14} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">{element.level > 1 ? "Piso 2" : "Piso 1"}</text>
                          {isSelected && (
                            <g onMouseDown={stopLayoutAction} onClick={stopLayoutAction}>
                              <rect x={element.x + 70} y={element.y - 42} width="72" height="24" rx="8" fill="#0f172a" />
                              <text x={element.x + 106} y={element.y - 26} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); rotateLayoutElement(element.id); }}>Rotar</text>
                              <rect x={element.x + 70} y={element.y - 14} width="72" height="24" rx="8" fill="#dc2626" />
                              <text x={element.x + 106} y={element.y + 2} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); removeLayoutElement(element.id); }}>Eliminar</text>
                            </g>
                          )}
                        </g>
                      );
                    }
                    if (element.type === "stairs") {
                      const stairWidth = Math.max(24, Math.min(64, element.width || 64));
                      const stairHeight = Math.max(36, stairWidth * 1.05);
                      const rectX = element.x - stairWidth / 2;
                      const rectY = element.y - stairHeight / 2;
                      const innerX = stairWidth * 0.18;
                      const innerY = stairHeight * 0.16;
                      const topY = element.y - stairHeight / 2 + stairHeight * 0.28;
                      const bottomY = element.y + stairHeight / 2 - stairHeight * 0.18;
                      return (
                        <g key={element.id} transform={`rotate(${rotation} ${element.x} ${element.y})`} onMouseDown={(e) => { e.stopPropagation(); suppressCreateRef.current = true; dragIntentRef.current = true; setSelectedLayoutElementId(element.id); setDragging({ kind: "element", id: element.id }); }} onClick={(e) => { e.stopPropagation(); setSelectedLayoutElementId(element.id); }}>
                          <rect x={rectX} y={rectY} width={stairWidth} height={stairHeight} rx={12} fill="#fff7ed" stroke={color} strokeWidth="2" />
                          <path d={`M ${element.x - stairWidth / 2 + innerX} ${bottomY} L ${element.x + stairWidth / 2 - innerX} ${bottomY} L ${element.x + stairWidth / 2 - innerX} ${topY} L ${element.x - stairWidth / 2 + stairWidth * 0.4} ${topY} L ${element.x - stairWidth / 2 + stairWidth * 0.4} ${element.y - innerY} L ${element.x - stairWidth / 2 + innerX} ${element.y - innerY} Z`} fill={color} opacity="0.9" />
                          {isSelected && (
                            <g onMouseDown={stopLayoutAction} onClick={stopLayoutAction}>
                              <rect x={element.x + stairWidth / 2 + 6} y={element.y - stairHeight / 2 - 14} width="72" height="24" rx="8" fill="#0f172a" />
                              <text x={element.x + stairWidth / 2 + 42} y={element.y - stairHeight / 2 + 2} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); rotateLayoutElement(element.id); }}>Rotar</text>
                              <rect x={element.x + stairWidth / 2 + 6} y={element.y - stairHeight / 2 + 14} width="72" height="24" rx="8" fill="#dc2626" />
                              <text x={element.x + stairWidth / 2 + 42} y={element.y - stairHeight / 2 + 30} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); removeLayoutElement(element.id); }}>Eliminar</text>
                            </g>
                          )}
                        </g>
                      );
                    }
                    const box = getElementBoxMetrics(element);
                    const labelLines = getElementLabelLines(element);
                    return (
                      <g key={element.id} transform={`rotate(${rotation} ${element.x} ${element.y})`} onMouseDown={(e) => { e.stopPropagation(); suppressCreateRef.current = true; dragIntentRef.current = true; setSelectedLayoutElementId(element.id); setDragging({ kind: "element", id: element.id }); }} onClick={(e) => { e.stopPropagation(); setSelectedLayoutElementId(element.id); }}>
                        <rect x={element.x - box.width / 2} y={element.y - box.height / 2} width={box.width} height={box.height} rx={10} fill={element.type === "window" ? "#eff6ff" : "#f0fdf4"} stroke={color} strokeWidth="2" />
                        <text x={element.x} y={element.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill={color}>
                          {labelLines[0]}
                        </text>
                        {isSelected && (
                          <g onMouseDown={stopLayoutAction} onClick={stopLayoutAction}>
                            <rect x={element.x + box.width / 2 + 2} y={element.y - 34} width="72" height="24" rx={8} fill="#0f172a" />
                            <text x={element.x + box.width / 2 + 38} y={element.y - 18} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); rotateLayoutElement(element.id); }}>Rotar</text>
                            <rect x={element.x + box.width / 2 + 2} y={element.y - 6} width="72" height="24" rx={8} fill="#dc2626" />
                            <text x={element.x + box.width / 2 + 38} y={element.y + 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="white" onClick={(e) => { stopLayoutAction(e); removeLayoutElement(element.id); }}>Eliminar</text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {visibleTables.map((table) => {
                    const size = table.size || (table.seats <= 2 ? 48 : table.seats <= 4 ? 60 : 72);
                    const col = TABLE_COLORS[table.status];
                    return (
                      <g key={table.id} onMouseDown={(e) => { e.stopPropagation(); suppressCreateRef.current = true; dragIntentRef.current = true; setDragging({ kind: "table", id: table.id }); setSelectedTableId(table.id); setSelectedLayoutElementId(null); }} onClick={() => { setSelectedTableId(table.id); setSelectedLayoutElementId(null); }} style={{ cursor: "grab" }}>
                        <rect x={table.x - size / 2 + 3} y={table.y - size / 2 + 3} width={size} height={size} rx={10} fill="#00000015" />
                        <rect x={table.x - size / 2} y={table.y - size / 2} width={size} height={size} rx={table.seats <= 2 ? size / 2 : 10}
                          fill={col.bg} stroke={col.border} strokeWidth="2" />
                        {Array.from({ length: table.seats }).map((_, i) => {
                          const angle = (i / table.seats) * 2 * Math.PI - Math.PI / 2;
                          const r = size / 2 + 12;
                          return <circle key={i} cx={table.x + r * Math.cos(angle)} cy={table.y + r * Math.sin(angle)} r={6} fill="#e2e8f0" stroke={col.border} strokeWidth="1" />;
                        })}
                        <text x={table.x} y={table.y - 2} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill={col.text}>{table.label}</text>
                        <text x={table.x} y={table.y + 12} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill={col.text}>{table.seats}p</text>
                        <rect x={table.x - 24} y={table.y + 20} width="48" height="12" rx="6" fill="#0f172a" opacity="0.8" />
                        <text x={table.x} y={table.y + 28} textAnchor="middle" fontSize="9" fontWeight="700" fill="white">{table.floor > 1 ? `P${table.floor}` : "P1"}</text>
                      </g>
                    );
                  })}
                </svg>
                  </div>
                </div>
              </div>

              {selectedTable && (
                <div style={{ marginTop: 18, background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, color: "#0f172a" }}>Mesa {selectedTable.label} seleccionada</p>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Asigna el piso, ajusta la capacidad y deja notas para el turno.</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {floorCount > 1 ? Array.from({ length: floorCount }, (_, index) => index + 1).map(floor => (
                        <button key={floor} onClick={() => updateTableFloor(selectedTable.id, floor)} style={{ padding: "8px 12px", borderRadius: 10, border: selectedTable.floor === floor ? "2px solid #0f172a" : "1px solid #e2e8f0", background: selectedTable.floor === floor ? "#0f172a" : "white", color: selectedTable.floor === floor ? "white" : "#374151", fontWeight: 600, cursor: "pointer" }}>
                          {floorNames[floor] || (floor === 1 ? "Piso principal" : `Piso ${floor}`)}
                        </button>
                      )) : (
                        <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Se usará el piso principal por defecto</span>
                      )}
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#334155" }}>
                        Tamaño
                        <input
                          type="number"
                          min="24"
                          max="64"
                          step="1"
                          value={selectedTable.size || 60}
                          onBlur={(e) => updateTableSize(selectedTable.id, e.target.value)}
                          onChange={(e) => handleTableSizeInputChange(selectedTable.id, e.target.value)}
                          style={{ width: 70, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff" }}
                        />
                      </label>
                      <button
                        onClick={() => removeTable(selectedTable.id)}
                        style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontWeight: 700, cursor: "pointer" }}
                      >
                        Borrar mesa
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "start" }}>
                    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
                      <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>Capacidad</p>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{selectedTable.seats} personas</p>
                    </div>
                    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
                      <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>Reserva activa</p>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: selectedTable.status === "occupied" || selectedTable.status === "reserved" ? "#0f172a" : "#64748b" }}>
                        {selectedTable.status === "occupied" ? "En curso" : selectedTable.status === "reserved" ? "Reservada" : "Sin reserva activa"}
                      </p>
                    </div>
                    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
                      <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>Estado actual</p>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{selectedTable.status === "available" ? "Libre" : selectedTable.status === "occupied" ? "Ocupada" : "Reservada"}</p>
                    </div>
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "#334155" }}>
                    Notas del turno
                    <textarea
                      value={selectedTable.notes || ""}
                      onChange={(e) => updateTableNotes(selectedTable.id, e.target.value)}
                      rows={3}
                      placeholder="Ej. Mesa para cliente VIP, alergias, prioridad..."
                      style={{ ...inputStyle, resize: "vertical", minHeight: 78, marginBottom: 0 }}
                    />
                  </label>
                </div>
              )}

              {selectedLayoutElement && (
                <div style={{ marginTop: 18, background: "#fff7ed", border: "1.5px solid #fdba74", borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0, maxWidth: 380 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: "#9a2c00" }}>{getLayoutElementLabel(selectedLayoutElement)}</p>
                    <p style={{ margin: "4px 0 0", color: "#c2410c", fontSize: 13 }}>Arrastra el elemento para moverlo. Cambia su nombre y tamaño para adaptarlo mejor al plano.</p>
                  </div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#7c2d12" }}>Nombre del elemento</label>
                  <input
                    value={selectedLayoutElement.label || ""}
                    onChange={(e) => updateLayoutElementLabel(selectedLayoutElement.id, e.target.value)}
                    placeholder={getLayoutElementLabel(selectedLayoutElement)}
                    style={{ ...inputStyle, marginBottom: 0, minHeight: 44, width: "100%", maxWidth: 340, whiteSpace: "normal" }}
                  />
                  {selectedLayoutElement.type === "zone" && (
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#7c2d12" }}>
                      Tipo de zona
                      <select
                        value={selectedLayoutElement.subtype || "bar"}
                        onChange={(e) => updateLayoutElementSubtype(selectedLayoutElement.id, e.target.value)}
                        style={{ ...inputStyle, marginTop: 4, marginBottom: 0, width: "100%" }}
                      >
                        <option value="bar">Bar</option>
                        <option value="terrace">Terraza</option>
                        <option value="kitchen">Cocina</option>
                        <option value="vip">VIP</option>
                      </select>
                    </label>
                  )}
                  {selectedLayoutElement.type === "stairs" && (
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#7c2d12" }}>
                      Tamaño de escalera
                      <input
                        type="number"
                        min="24"
                        max="64"
                        step="1"
                        value={selectedLayoutElement.width || 64}
                        onBlur={(e) => updateLayoutElementSize(selectedLayoutElement.id, e.target.value)}
                        onChange={(e) => handleLayoutElementSizeInputChange(selectedLayoutElement.id, e.target.value)}
                        style={{ ...inputStyle, marginTop: 4, marginBottom: 0, width: "100%" }}
                      />
                    </label>
                  )}
                </div>
              )}


            </div>
          )}

          {/* RESERVATIONS */}
          {tab === "reservations" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Reservas</h2>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>
                    Hoy: {todaysReservations.length}
                  </span>
                  <span style={{ background: "#fef9c3", color: "#a16207", borderRadius: 999, padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>
                    Próximas: {upcomingReservations.length}
                  </span>
                  {lastReservationsSync && (
                    <span style={{ color: "#64748b", fontSize: 12, fontWeight: 600 }}>
                      Actualizado {lastReservationsSync.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
              {sortedReservations.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
                  <p style={{ fontSize: 40, marginBottom: 12 }}>📅</p>
                  <p style={{ fontSize: 16 }}>No hay reservas registradas</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {Object.entries(reservationGroups).sort(([a], [b]) => a.localeCompare(b)).map(([day, reservations]) => (
                    <div key={day} style={{ background: "white", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "16px 18px" }}>
                      <div style={{ marginBottom: 12, fontWeight: 800, color: "#0f172a" }}>
                        {day === today ? "Hoy" : day}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {reservations.map((res) => {
                          const table = activeTables.find((t) => t.id === res.tableId);
                          const isActive = res?.status === "confirmed" || res?.status === "occupied";
                          return (
                            <div key={res.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                              <div style={{ background: isActive ? "#dbeafe" : "#fef9c3", borderRadius: 12, padding: "10px 14px", textAlign: "center", minWidth: 70 }}>
                                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isActive ? "#2563eb" : "#a16207" }}>{res.time}</p>
                                <p style={{ margin: 0, fontSize: 12, color: isActive ? "#60a5fa" : "#ca8a04" }}>{res.date.split("-")[2]}/{res.date.split("-")[1]}</p>
                              </div>
                              <div style={{ flex: 1 }}>
                                <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#0f172a", fontSize: 16 }}>{res.name || res.customerName || "Cliente"}</p>
                                <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
                                  Mesa {table?.label || res.tableId} · {res.guests || res.partySize || 2} personas
                                </p>
                              </div>
                              <span style={{ background: isActive ? "#dcfce7" : "#fef9c3", color: isActive ? "#15803d" : "#a16207", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
                                {isActive ? "En curso" : "Reservada"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* REGISTER NEW RESTAURANT */}
          {tab === "register" && (
            <div style={{ maxWidth: 520 }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Registrar nuevo restaurante</h2>
              <p style={{ color: "#64748b", marginBottom: 24 }}>Una vez registrado, podrás añadir el plano de mesas desde el editor.</p>

              {regDone ? (
                <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 14, padding: "24px", textAlign: "center" }}>
                  <p style={{ fontSize: 40 }}>✅</p>
                  <p style={{ fontWeight: 700, color: "#15803d", fontSize: 18 }}>¡Restaurante registrado!</p>
                </div>
              ) : (
                <>
                  {[
                    { key: "name", label: "Nombre del restaurante", placeholder: "Ej: El Rincón de María" },
                    { key: "cuisine", label: "Tipo de cocina", placeholder: "Ej: Española, Italiana…" },
                    { key: "address", label: "Dirección", placeholder: "Calle, número, ciudad" },
                    { key: "phone", label: "Teléfono", placeholder: "+34 91 000 0000" },
                  ].map(f => (
                    <div key={f.key}>
                      <Label>{f.label}</Label>
                      <input placeholder={f.placeholder} value={regForm[f.key]}
                        onChange={e => setRegForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={inputStyle} />
                    </div>
                  ))}

                  <Label>Descripción</Label>
                  <textarea
                    placeholder="Describe brevemente tu restaurante…"
                    value={regForm.description}
                    onChange={e => setRegForm(p => ({ ...p, description: e.target.value }))}
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />

                  <button
                    onClick={registerRestaurant}
                    disabled={!regForm.name || !regForm.address}
                    style={{ width: "100%", background: regForm.name && regForm.address ? "#0f172a" : "#e2e8f0", color: regForm.name && regForm.address ? "white" : "#94a3b8", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
                    Registrar restaurante
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
