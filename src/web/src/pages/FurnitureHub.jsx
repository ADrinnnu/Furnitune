// src/pages/FurnitureHub.jsx
import React from "react";
import { useSearchParams } from "react-router-dom";
import AllFurnitures from "./AllFurnitures";

const TABS = [
  { key: "all",          label: "ALL FURNITURES", room: null,          collection: null },
  { key: "best-sellers", label: "BEST SELLERS",   room: null,          collection: "best-sellers" },
  { key: "new-designs",  label: "NEW DESIGNS",    room: null,          collection: "new-designs" },
  { key: "living-room",  label: "LIVING ROOM",    room: "living-room", collection: null },
  { key: "bedroom",      label: "BEDROOM",        room: "bedroom",     collection: null },
  { key: "dining-room",  label: "DINING ROOM",    room: "dining-room", collection: null },
  { key: "outdoor",      label: "OUTDOOR",        room: "outdoor",     collection: null },
];

export default function FurnitureHub() {
  const [params, setParams] = useSearchParams();
  const activeKey = params.get("tab") || "all";
  const active = TABS.find(t => t.key === activeKey) || TABS[0];

  const setTab = (key) => {
    params.set("tab", key);
    setParams(params, { replace: true });
  };

  return (
    <div className="furniture-hub">
      {/* Tabs */}
      <div className="hub-tabs" style={{
        display: "flex",
        gap: 18,
        padding: "8px 0 14px",
        borderBottom: "1px solid #d8d1be"
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={t.key === active.key ? "tab active" : "tab"}
            style={{
              background: "transparent",
              border: "none",
              padding: "6px 0",
              letterSpacing: ".12em",
              fontWeight: 800,
              color: t.key === active.key ? "#1f4f43" : "#3c463f",
              opacity: t.key === active.key ? 1 : 0.8,
              cursor: "pointer"
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Reuse the same list + filters for the active tab */}
      <AllFurnitures
        key={active.key}               // reset filters when switching tabs
        room={active.room}
        collection={active.collection}
        pageTitle={active.label}
      />
    </div>
  );
}
