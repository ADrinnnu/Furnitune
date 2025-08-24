import { provider } from "../data";
import React, { useEffect, useMemo, useState } from "react";

export default function AuditLog() {
  const [shipments, setShipments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Load all shipments, select first by default
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await provider.listShipments();
        if (!alive) return;
        setShipments(s || []);
        if (s && s.length > 0) setSelectedId(s[0].id);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load events for the selected shipment
  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      return;
    }
    let alive = true;
    setLoadingEvents(true);
    provider.listShipmentEvents(selectedId)
      .then((ev) => { if (alive) setEvents(ev || []); })
      .finally(() => { if (alive) setLoadingEvents(false); });
    return () => { alive = false; };
  }, [selectedId]);

  return (
    <div>
      <h2>Audit Log</h2>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>
        {/* Left pane: shipment list */}
        <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="admin-toolbar" style={{ padding: 12 }}>
            <strong>Shipments</strong>
          </div>
          <div style={{ maxHeight: 480, overflow: "auto" }}>
            {loading ? (
              <div style={{ padding: 12 }}>Loading…</div>
            ) : shipments.length === 0 ? (
              <div style={{ padding: 12 }}>No shipments found.</div>
            ) : (
              <ul className="admin-list">
                {shipments.map((s) => (
                  <li
                    key={s.id}
                    className={s.id === selectedId ? "selected" : ""}
                    onClick={() => setSelectedId(s.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>#{s.id.slice(0, 6)}</span>
                      <span className="muted">{s.status}</span>
                    </div>
                    <div className="muted small">
                      {s.orderId ? `Order: ${s.orderId}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right pane: events table */}
        <div>
          <div className="admin-card">
            <div className="admin-toolbar">
              <strong>Events</strong>
              {selectedId && (
                <span className="muted"> for Shipment #{String(selectedId).slice(0, 6)}</span>
              )}
            </div>

            {loadingEvents ? (
              <div>Loading events…</div>
            ) : events.length === 0 ? (
              <div>No events found.</div>
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
                      <td>
                        {ev.from ? ev.from : "—"} → {ev.to}
                      </td>
                      <td>{ev.note || ""}</td>
                      <td>{ev.by || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
