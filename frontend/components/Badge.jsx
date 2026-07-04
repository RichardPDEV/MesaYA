import React from "react";
import { TABLE_COLORS } from "../lib/constants.js";

export default function Badge({ status }) {
  const c = TABLE_COLORS[status];
  return (
    <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
      {c.label}
    </span>
  );
}
