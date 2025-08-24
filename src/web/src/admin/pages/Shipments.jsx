import React, { useEffect, useMemo, useState } from "react";
import { provider } from "../data";


// UI-side allowed transitions (matches the mock provider and is safe for Firebase too)
const ALLOWED = {
  pending: ["processing", "cancelled"],
  processing: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["in_transit"],
  in_transit: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: ["returned"],
  returned: [],
  cancelled: [],
};

const ALL_STATUSES = Object.keys(ALLOWED);

export default function Shipments() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [events, setEvents] = useState([]);
  const [loadingEv, setLoadingEv] = useState(false);

  const [note, setNote] = useState("");
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  // Load shipments
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await provider.listShipments();
        if (!alive) return;
        setRows(data || []);
        if (data && data.length && !selectedId) setSelectedId(data[0].id);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => (alive = false);
  }, []);

  // Load events for selected shipment
  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      return;
    }
    let alive = true;
    (async () => {
      setLoadingEv(true);
      try {
        const ev = await provider.listShipmentEvents(selectedId);
        if (!alive) return;
        setEvents(ev || []);
      } finally {
        if (alive) setLoadingEv(false);
      }
    })();
    return () => (alive = false);
  }, [selectedId]);

  async function advance(to) {
    if (!selected) return;
    const ok = window.confirm(`Move shipment #${String(selected.id).slice(0, 6)}:\n${selected.status} → ${to}?`);
    if (!ok) return;

    await provider.advanceShipment(selected.id, to, note || "");
    // optimistic UI: update local rows + reload events
    setRows((prev) =>
      prev.map((r) => (r.id === selected.id ? { ...r, status: to, updatedAt: Date.now() } : r))
    );
    setNote("");
    // refresh events
    setLoadingEv(true);
    const ev = await provider.listShipmentEvents(selected.id);
    setEvents(ev || []);
    setLoadingEv(false);
  }

  const nextStatuses = useMemo(() => {
    if (!selected) return [];
    return ALLOWED[selected.status] || [];
  }, [selected]);

  return (
    <div>
      <h2>Shipments</h2>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
        {/* Left: Shipment list */}
        <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="admin-toolbar" style={{ padding: 12 }}>
            <strong>All Shipments</strong>
          </div>
          <div style={{ maxHeight: 520, overflow: "auto" }}>
            {loading ? (
              <div style={{ padding: 12 }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 12 }}>No shipments found.</div>
            ) : (
              <ul className="admin-list">
                {rows.map((s) => (
                  <li
                    key={s.id}
                    className={s.id === selectedId ? "selected" : ""}
                    onClick={() => setSelectedId(s.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>#{String(s.id).slice(0, 6)}</span>
                      <span className="muted">{s.status}</span>
                    </div>
                    <div className="muted small">
                      {s.orderId ? `Order: ${s.orderId}` : ""}
                      {s.updatedAt ? ` • ${new Date(s.updatedAt).toLocaleString()}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Details + Actions + Events */}
        <div className="admin-card">
          {!selected ? (
            <div>Select a shipment to view details.</div>
          ) : (
            <>
              <div className="admin-toolbar" style={{ marginBottom: 8 }}>
                <div>
                  <strong>Shipment #{String(selected.id).slice(0, 6)}</strong>{" "}
                  <span className="muted">({selected.status})</span>
                </div>
                <div className="muted small">{selected.orderId ? `Order: ${selected.orderId}` : ""}</div>
              </div>

              {/* Advance controls */}
              <div className="admin-card" style={{ padding: 12, marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                  <input
                    className="admin-input"
                    placeholder="Optional note (who, where, etc.)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {nextStatuses.length === 0 ? (
                      <span className="muted">No further transitions</span>
                    ) : (
                      nextStatuses.map((to) => (
                        <button key={to} className="admin-btn primary" onClick={() => advance(to)}>
                          {selected.status} → {to}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Quick facts */}
              <div className="admin-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <Fact label="Status" value={selected.status} />
                <Fact
                  label="Updated"
                  value={selected.updatedAt ? new Date(selected.updatedAt).toLocaleString() : "—"}
                />
                <Fact label="Order ID" value={selected.orderId || "—"} />
              </div>

              {/* Events */}
              <div className="admin-card">
                <h3 style={{ marginTop: 0 }}>Event history</h3>
                {loadingEv ? (
                  <div>Loading events…</div>
                ) : events.length === 0 ? (
                  <div>No events for this shipment.</div>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Change</th>
                        <th>Note</th>
                        <th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((ev) => (
                        <tr key={ev.id}>
                          <td>{ev.at ? new Date(ev.at).toLocaleString() : "—"}</td>
                          <td>{(ev.from || "—") + " → " + ev.to}</td>
                          <td>{ev.note || ""}</td>
                          <td>{ev.by || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="admin-fact">
      <div className="muted small">{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}
