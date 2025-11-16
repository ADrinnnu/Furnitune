// src/admin/pages/Shipments.jsx
import React, { useEffect, useMemo, useState } from "react";
import { firebaseProvider as provider } from "../data/firebase/firebaseProvider";

/* ----------------------------- constants ----------------------------- */
const STATUS_LABEL = {
  pending: "Pending",
  processing: "Processing",
  ready_to_ship: "Ready to Ship",
  shipped: "Shipped",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
};

const STATUS_COLOR = {
  pending: "#6b7280",
  processing: "#2563eb",
  ready_to_ship: "#0ea5e9",
  shipped: "#0ea5e9",
  in_transit: "#a855f7",
  out_for_delivery: "#f59e0b",
  delivered: "#10b981",
  returned: "#ef4444",
  cancelled: "#ef4444",
};

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

/* ------------------------------- helpers ----------------------------- */
function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function fmtDT(tsOrMs) {
  const ms = typeof tsOrMs === "number" ? tsOrMs : tsToMillis(tsOrMs);
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString(); } catch { return "—"; }
}

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || "#6b7280";
  return (
    <span style={{
      display: "inline-block",
      padding: "4px 8px",
      borderRadius: 999,
      background: `${color}22`,
      color,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function Cell({ title, mono, center, children }) {
  return (
    <div
      title={title}
      style={{
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: center ? "center" : "left",
        fontFamily: mono
          ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          : "inherit",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------- page -------------------------------- */
export default function Shipments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [nextStatus, setNextStatus] = useState("");
  const [note, setNote] = useState("");
  const [advancing, setAdvancing] = useState(false);

  // small note after cleaning
  const [cleanNote, setCleanNote] = useState("");

  async function loadShipments() {
    setErr("");
    setLoading(true);
    try {
      const list = await provider.listShipments();
      setRows(list);
      if (selected) {
        const updated = list.find((x) => x.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (e) {
      console.error(e);
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshAndClean() {
    setErr("");
    setLoading(true);
    try {
      // run cleaner first (if implemented)
      if (typeof provider.cleanOrphanShipments === "function") {
        const res = await provider.cleanOrphanShipments({ fix: true });
        // res can be a number or an object like {deleted: n}
        const n =
          typeof res === "number"
            ? res
            : (res && (res.deleted ?? res.removed ?? res.count)) || 0;
        if (n > 0) {
          setCleanNote(`Cleaned ${n} orphan${n === 1 ? "" : "s"}.`);
          // auto-hide message
          setTimeout(() => setCleanNote(""), 3500);
        } else {
          setCleanNote("No orphans found.");
          setTimeout(() => setCleanNote(""), 2500);
        }
      }
    } catch (e) {
      console.warn("cleanOrphanShipments failed:", e);
      setCleanNote("");
      // don't block refresh even if cleaning fails
    } finally {
      await loadShipments();
    }
  }

  async function loadEvents(shipmentId) {
    if (!shipmentId) return;
    setEvents([]);
    setEventsLoading(true);
    try {
      const list = await provider.listShipmentEvents(shipmentId);
      setEvents(list);
    } catch (e) {
      console.error(e);
      setErr(String(e?.message || e));
    } finally {
      setEventsLoading(false);
    }
  }

  function onSelect(row) {
    setSelected(row);
    setNote("");
    const allowed = ALLOWED[row.status] || [];
    setNextStatus(allowed[0] || "");
    loadEvents(row.id);
  }

  async function onAdvance() {
    if (!selected || !nextStatus) return;
    // avoid no-op / duplicates
    if (nextStatus === selected.status) return;

    setAdvancing(true);
    setErr("");
    try {
      const target = nextStatus; // status we are moving TO
      await provider.advanceShipment(selected.id, target, note.trim());

      await loadShipments();
      await loadEvents(selected.id);

      const allowed = ALLOWED[target] || [];
      setNextStatus(allowed[0] || "");
      setNote("");
    } catch (e) {
      console.error(e);
      setErr(String(e?.message || e));
    } finally {
      setAdvancing(false);
    }
  }

  useEffect(() => {
    loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full-width table layout (headers aligned with cells)
  const columns = useMemo(
    () => [
      { key: "id", label: "Shipment ID", width: "320px", mono: true },
      { key: "orderId", label: "Order ID", width: "320px", mono: true },
      { key: "user", label: "User", width: "300px" },
      { key: "status", label: "Status", width: "180px", center: true },
      { key: "updatedAt", label: "Updated", width: "240px" },
    ],
    []
  );
  const gridTemplate = columns.map((c) => c.width).join(" ");

  const displayUser = (r) => r.userEmail || r.userId || "—";

  return (
    <div style={{ padding: 24 }}>
      {/* header row above table */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Shipments</h2>
        <button
          onClick={refreshAndClean}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "white",
            cursor: "pointer",
          }}
          disabled={loading}
          title="Refresh & clean orphans"
        >
          ⟳ Refresh
        </button>
        {loading && <span style={{ fontSize: 12, color: "#6b7280" }}>Loading…</span>}
        {cleanNote && (
          <span style={{ fontSize: 12, color: "#047857" }}>
            {cleanNote}
          </span>
        )}
        {err && <span style={{ marginLeft: "auto", color: "#ef4444", fontSize: 13 }}>{err}</span>}
      </div>

      {/* LIST: full-width */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          overflow: "hidden",
          background: "white",
        }}
      >
        {/* table header aligned with grid columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            padding: "10px 12px",
            background: "#f9fafb",
            borderBottom: "1px solid #e5e7eb",
            fontWeight: 600,
            fontSize: 13,
            alignItems: "center",
          }}
        >
          {columns.map((c) => (
            <div key={c.key} style={{ textAlign: c.center ? "center" : "left" }}>
              {c.label}
            </div>
          ))}
        </div>

        {/* table body */}
        <div>
          {!loading && rows.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: "#6b7280" }}>No shipments yet.</div>
          )}

          {rows.map((r) => {
            const active = r.id === selected?.id;
            return (
              <div
                key={r.id}
                onClick={() => onSelect(r)}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridTemplate,
                  padding: "12px 12px",
                  borderTop: "1px solid #f3f4f6",
                  alignItems: "center",
                  cursor: "pointer",
                  background: active ? "#f0f9ff" : "white",
                  columnGap: 12,
                }}
              >
                <Cell title={r.id} mono>{r.id}</Cell>
                <Cell title={r.orderId} mono>{r.orderId || "—"}</Cell>
                <Cell title={displayUser(r)}>{displayUser(r)}</Cell>
                <Cell title={STATUS_LABEL[r.status] || r.status} center>
                  <StatusBadge status={r.status} />
                </Cell>
                <Cell title={fmtDT(r.updatedAt)}>{fmtDT(r.updatedAt)}</Cell>
              </div>
            );
          })}
        </div>
      </div>

      {/* DETAILS: stacked under the table (full width) */}
      <div
        style={{
          marginTop: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 16,
          background: "white",
        }}
      >
        {!selected ? (
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            Select a shipment to view details and history.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Shipment</h3>
              <code style={{ background: "#f3f4f6", borderRadius: 6, padding: "2px 6px", fontSize: 12 }}>
                {selected.id}
              </code>
              <div style={{ marginLeft: "auto" }}>
                <StatusBadge status={selected.status} />
              </div>
            </div>

            {/* advance */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Advance Status</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                <label style={{ fontSize: 12, color: "#374151" }}>
                  Next status
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    style={{
                      width: "100%",
                      marginTop: 4,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    {(ALLOWED[selected.status] || []).length === 0 && (
                      <option value="">— No further transitions —</option>
                    )}
                    {(ALLOWED[selected.status] || []).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s] || s}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 12, color: "#374151" }}>
                  Note (optional)
                  <textarea
                    rows={2}
                    placeholder="e.g., Packed by Carlos / Handed to courier / Webhook update"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={{
                      width: "100%",
                      marginTop: 4,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      resize: "vertical",
                    }}
                  />
                </label>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={onAdvance}
                    disabled={!nextStatus || advancing}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: nextStatus ? "#111827" : "#9ca3af",
                      color: "white",
                      cursor: nextStatus ? "pointer" : "not-allowed",
                      fontWeight: 600,
                    }}
                  >
                    {advancing ? "Updating…" : "Advance"}
                  </button>
                  <button
                    onClick={() => {
                      setNote("");
                      const a = ALLOWED[selected.status] || [];
                      setNextStatus(a[0] || "");
                    }}
                    disabled={advancing}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* details */}
            <div
              style={{
                border: "1px solid #f3f4f6",
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Details</div>
              <div style={{ fontSize: 13, display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 6 }}>
                <div style={{ color: "#6b7280" }}>Order</div><div>{selected.orderId || "—"}</div>
                <div style={{ color: "#6b7280" }}>User</div><div>{selected.userEmail || selected.userId || "—"}</div>
                <div style={{ color: "#6b7280" }}>Courier</div><div>{selected.courier || "—"}</div>
                <div style={{ color: "#6b7280" }}>Tracking</div><div>{selected.trackingNumber || "—"}</div>
                <div style={{ color: "#6b7280" }}>Created</div><div>{fmtDT(selected.createdAt)}</div>
                <div style={{ color: "#6b7280" }}>Updated</div><div>{fmtDT(selected.updatedAt)}</div>
              </div>
            </div>

            {/* history */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Event History</div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, minHeight: 160, padding: 8 }}>
                {eventsLoading && (
                  <div style={{ padding: 8, fontSize: 13, color: "#6b7280" }}>Loading events…</div>
                )}
                {!eventsLoading && events.length === 0 && (
                  <div style={{ padding: 8, fontSize: 13, color: "#6b7280" }}>No events yet.</div>
                )}
                {!eventsLoading && events.length > 0 && (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {events.map((ev) => (
                      <li
                        key={ev.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "160px 1fr",
                          gap: 8,
                          padding: "8px 6px",
                          borderTop: "1px dashed #f3f4f6",
                        }}
                      >
                        <div style={{ color: "#6b7280", fontSize: 12 }}>{fmtDT(ev.at)}</div>
                        <div style={{ fontSize: 13 }}>
                          <div style={{ marginBottom: 2 }}>
                            <strong>{STATUS_LABEL[ev.from] || ev.from}</strong> →{" "}
                            <strong>{STATUS_LABEL[ev.to] || ev.to}</strong>
                          </div>
                          {ev.note && <div style={{ color: "#374151" }}>{ev.note}</div>}
                          <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
                            {ev.by ? `by ${ev.by}` : ""}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
