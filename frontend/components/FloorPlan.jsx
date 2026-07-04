import React from "react";
import { TABLE_COLORS } from "../lib/constants.js";

export default function FloorPlan({ tables, onTableClick, selectedTableId, editable = false, layoutElements = [], floor = null, showLegend = true, title = null, showOnlyTables = false, statusFilter = null }) {
  const getSize = (seats) => (seats <= 2 ? 48 : seats <= 4 ? 60 : 72);
  const visibleTables = (tables || []).filter((table) => floor === null || (table.floor || 1) === floor);
  const visibleLayoutElements = (layoutElements || []).filter((element) => {
    if (floor === null) return true;
    if (element.type === "floor") return (element.level || 1) === floor;
    return (element.floor || 1) === floor;
  });

  const positionedTables = (() => {
    const used = {};
    return visibleTables.map((table, index) => {
      const rawX = Number(table.x);
      const rawY = Number(table.y);
      const hasCoords = Number.isFinite(rawX) && Number.isFinite(rawY);
      const baseX = hasCoords ? rawX : 80 + (index % 5) * 90;
      const baseY = hasCoords ? rawY : 90 + Math.floor(index / 5) * 90;
      const key = `${Math.round(baseX)}-${Math.round(baseY)}`;
      const overlapCount = used[key] || 0;
      used[key] = overlapCount + 1;
      const x = baseX + overlapCount * 22;
      const y = baseY + overlapCount * 22;
      return { ...table, x, y };
    });
  })();

  return (
    <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 16, overflow: "hidden", position: "relative" }}>
      {/* Room decoration */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, #e2e8f0 1px, transparent 1px)", backgroundSize: "32px 32px", opacity: 0.4 }} />
      <div style={{ position: "relative", width: "100%" }}>
      <svg width="100%" viewBox="0 0 540 360" style={{ display: "block", cursor: editable ? "default" : "pointer" }}>
        {/* Room labels */}
        <text x="20" y="24" fontSize="11" fill="#94a3b8" fontWeight="600" letterSpacing="1">{title || "PLANO DEL RESTAURANTE"}</text>
        <rect x="0" y="0" width="540" height="360" rx="0" fill="transparent" />

        {!showOnlyTables && visibleLayoutElements.map((element) => {
          const color = element.type === "door" ? "#34d399" : element.type === "window" ? "#60a5fa" : element.type === "stairs" ? "#f59e0b" : "#cbd5e1";
          if (element.type === "floor") {
            return (
              <g key={element.id}>
                <rect x={element.x - (element.width || 140) / 2} y={element.y - (element.height || 90) / 2} width={element.width || 140} height={element.height || 90} rx={16} fill="#f8fafc" stroke="#94a3b8" strokeDasharray="6 4" />
                <text x={element.x} y={element.y - 3} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="#475569">{element.label || "Piso superior"}</text>
                <text x={element.x} y={element.y + 14} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#64748b">{element.level > 1 ? "Piso 2" : "Piso 1"}</text>
              </g>
            );
          }
          if (element.type === "stairs") {
            return (
              <g key={element.id}>
                <rect x={element.x - 30} y={element.y - 32} width="60" height="64" rx="12" fill="#fff7ed" stroke={color} strokeWidth="2" />
                <path d={`M ${element.x - 20} ${element.y + 20} L ${element.x + 20} ${element.y + 20} L ${element.x + 20} ${element.y - 10} L ${element.x - 5} ${element.y - 10} L ${element.x - 5} ${element.y + 5} L ${element.x - 20} ${element.y + 5} Z`} fill={color} opacity="0.9" />
                <text x={element.x} y={element.y + 42} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="#92400e">Escaleras</text>
              </g>
            );
          }
          return (
            <g key={element.id}>
              <rect x={element.x - (element.width || 52) / 2} y={element.y - (element.height || 22) / 2} width={element.width || 52} height={element.height || 22} rx={10} fill={element.type === "window" ? "#eff6ff" : "#f0fdf4"} stroke={color} strokeWidth="2" />
              <text x={element.x} y={element.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill={color}>{element.label || (element.type === "door" ? "Puerta" : "Ventana")}</text>
            </g>
          );
        })}

        {positionedTables.map((table) => {
          const size = getSize(table.seats);
          const col = TABLE_COLORS[table.status] || TABLE_COLORS.available;
          const isSelected = selectedTableId === table.id;
          const dimmed = statusFilter && table.status !== statusFilter;
          const cx = table.x;
          const cy = table.y;

          return (
            <g key={table.id} style={{ opacity: dimmed ? 0.35 : 1 }}>
              {/* Shadow */}
              <rect x={cx - size / 2 + 3} y={cy - size / 2 + 3} width={size} height={size} rx={table.seats <= 2 ? size / 2 : 10}
                fill="#00000022" />
              {/* Table body */}
              <rect
                x={cx - size / 2} y={cy - size / 2} width={size} height={size}
                rx={table.seats <= 2 ? size / 2 : 10}
                fill={col.bg}
                stroke={isSelected ? "#6366f1" : col.border}
                strokeWidth={isSelected ? 3 : 1.5}
              />
              {/* Chairs */}
              {Array.from({ length: table.seats }).map((_, i) => {
                const angle = (i / table.seats) * 2 * Math.PI - Math.PI / 2;
                const r = size / 2 + 12;
                const cx2 = cx + r * Math.cos(angle);
                const cy2 = cy + r * Math.sin(angle);
                return <circle key={i} cx={cx2} cy={cy2} r={6} fill="#e2e8f0" stroke={col.border} strokeWidth={1} />;
              })}
              {/* Label */}
              <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill={col.text}>{table.label}</text>
              <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill={col.text}>{table.seats}p</text>
              <rect x={cx - 20} y={cy + 20} width="40" height="12" rx="6" fill="#0f172a" opacity="0.8" />
              <text x={cx} y={cy + 28} textAnchor="middle" fontSize="9" fontWeight="700" fill="white">{Number(table.floor || 1) > 1 ? `P${Number(table.floor || 1)}` : "P1"}</text>
            </g>
          );
        })}
      </svg>

      {positionedTables.map((table) => {
        const size = getSize(table.seats);
        const isDisabled = table.status !== "available" || !onTableClick;
        return (
          <button
            key={`overlay-${table.id}`}
            type="button"
            aria-label={isDisabled ? `Mesa ${table.label} no disponible` : `Seleccionar mesa ${table.label}`}
            onClick={() => {
              if (isDisabled) return;
              onTableClick?.(table);
            }}
            style={{
              position: "absolute",
              left: `${(table.x / 540) * 100}%`,
              top: `${(table.y / 360) * 100}%`,
              width: size,
              height: size,
              transform: "translate(-50%, -50%)",
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: isDisabled ? "not-allowed" : "pointer",
              zIndex: 5,
            }}
          />
        );
      })}
      </div>

      {showLegend && !showOnlyTables && (
        <div style={{ display: "flex", gap: 16, padding: "10px 16px", borderTop: "1px solid #e2e8f0", background: "white", flexWrap: "wrap" }}>
          {Object.entries(TABLE_COLORS).map(([key, val]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: val.bg, border: `1.5px solid ${val.border}` }} />
              <span style={{ fontSize: 12, color: "#64748b" }}>{val.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
