// web/src/admin/pages/Orders.jsx  (adjust path if needed)
import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../firebase";
import {
  getFirestore,
  doc,
  updateDoc,
  serverTimestamp,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
} from "firebase/firestore";
import "../Orders.css";

const STATUS_OPTIONS = [
  { value: "processing", label: "Processing" },
  { value: "to_ship", label: "To Ship" },
  { value: "to_receive", label: "To Receive" },
  { value: "completed", label: "Completed" },
  { value: "refund", label: "Refund / Return" },
];

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

export default function Orders() {
  const db = useMemo(() => getFirestore(auth.app), []);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState({}); // { [orderId]: boolean }
  const [draft, setDraft] = useState({});   // { [orderId]: statusValue }

  // 🔴 LIVE subscription to /orders (newest first)
  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const stop = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setErr(e?.message || "Failed to load orders.");
        setLoading(false);
      }
    );
    return stop;
  }, [db]);

  const ordered = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) => tsToMillis(b?.createdAt) - tsToMillis(a?.createdAt)
    );
    if (filter === "all") return sorted;
    return sorted.filter((o) => (o?.status || "processing") === filter);
  }, [rows, filter]);

  const setOrderDraft = (id, status) => {
    setDraft((prev) => ({ ...prev, [id]: status }));
  };

  const saveStatus = async (id) => {
    const newStatus = draft[id];
    if (!newStatus) return;

    try {
      setSaving((prev) => ({ ...prev, [id]: true }));

      // 1) Update order
      await updateDoc(doc(db, "orders", id), {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
      });

      // 2) Optimistic local reflect (onSnapshot will also sync)
      setRows((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));

      // 3) Notify the order owner
      const order = rows.find((o) => o.id === id);
      const uid = order?.userId;
      if (uid) {
        const firstItem = Array.isArray(order?.items) ? order.items[0] : null;
        await addDoc(collection(db, "users", uid, "notifications"), {
          type: "order_status",
          orderId: id,
          status: newStatus,
          title: `Order ${String(id).slice(0, 6)} status updated`,
          body: `Status is now ${STATUS_LABEL[newStatus] || newStatus}.`,
          image: firstItem?.image || firstItem?.img || null,
          link: `/ordersummary?orderId=${id}`,
          createdAt: serverTimestamp(),
          read: false,
        });
      }
    } catch (e) {
      alert(e?.message || "Failed to update status.");
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="admin-orders">
      <div className="orders-topbar">
        <h2>Orders</h2>

        <div className="status-toolbar">
          {[
            { key: "all", label: "All" },
            ...STATUS_OPTIONS.map((s) => ({ key: s.value, label: s.label })),
          ].map((btn) => (
            <button
              key={btn.key}
              className={`chip ${filter === btn.key ? "active" : ""}`}
              onClick={() => setFilter(btn.key)}
              type="button"
            >
              {btn.label}
              {btn.key !== "all" && (
                <span className="chip-count">
                  {rows.filter((o) => (o?.status || "processing") === btn.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="err">{err}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && ordered.length === 0 && <p className="muted">No orders found.</p>}

      {!loading && ordered.length > 0 && (
        <div className="orders-card">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th width="1">Update</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((o) => {
                const id = o?.id || "";
                const when = fmtDate(o?.createdAt);
                const name =
                  o?.shippingAddress?.fullName ||
                  [o?.shippingAddress?.firstName, o?.shippingAddress?.lastName]
                    .filter(Boolean)
                    .join(" ") ||
                  o?.contactEmail ||
                  "—";
                const itemsCount = Array.isArray(o?.items)
                  ? o.items.reduce((sum, it) => sum + (Number(it?.qty) || 1), 0)
                  : 0;
                const total = fmtPHP(o?.total);
                const status = String(o?.status || "processing");
                const draftStatus = draft[id] ?? status;

                return (
                  <tr key={id}>
                    <td className="mono">{id}</td>
                    <td>{when}</td>
                    <td title={name}>{name}</td>
                    <td>{itemsCount}</td>
                    <td className="mono strong">{total}</td>
                    <td>
                      <span className={`badge status-${status}`}>
                        {(STATUS_LABEL[status] || status).toUpperCase()}
                      </span>
                    </td>
                    <td className="nowrap">
                      <select
                        className="status-select"
                        value={draftStatus}
                        onChange={(e) => setOrderDraft(id, e.target.value)}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="save-btn"
                        onClick={() => saveStatus(id)}
                        disabled={saving[id] || draftStatus === status}
                        type="button"
                        title={draftStatus === status ? "No changes" : "Save"}
                      >
                        {saving[id] ? "Saving…" : "Save"}
                      </button>
                    </td>
                    <td>
                      <details>
                        <summary>View</summary>

                        <div className="details-grid">
                          <div>
                            <div className="kv">
                              <label>Status</label>
                              <div>
                                <span className={`badge status-${status}`}>
                                  {(STATUS_LABEL[status] || status).toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <div className="kv">
                              <label>Date</label>
                              <div>{when}</div>
                            </div>
                            <div className="kv">
                              <label>Total</label>
                              <div className="mono strong">{total}</div>
                            </div>
                            {o?.shippingFee != null && (
                              <div className="kv">
                                <label>Shipping Fee</label>
                                <div className="mono">{fmtPHP(o.shippingFee)}</div>
                              </div>
                            )}
                          </div>

                          <div>
                            <h4>Customer</h4>
                            <div className="muted">
                              {[
                                o?.shippingAddress?.line1,
                                o?.shippingAddress?.line2,
                                o?.shippingAddress?.city,
                                o?.shippingAddress?.province,
                                o?.shippingAddress?.zip,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                            </div>
                            {o?.shippingAddress?.email && (
                              <div className="muted">{o.shippingAddress.email}</div>
                            )}
                          </div>

                          <div className="span-2">
                            <h4>Items</h4>
                            <ul className="items">
                              {(o?.items || []).map((it, i) => (
                                <li key={i} className="item">
                                  <div className="item-title">
                                    {it?.title || it?.name || "Item"}
                                  </div>
                                  <div className="muted">
                                    {it?.size ? `${it.size} ` : ""}Qty: {it?.qty ?? 1}
                                  </div>
                                  <div className="mono">{fmtPHP(it?.price)}</div>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {o?.note && (
                            <div className="span-2">
                              <h4>Note</h4>
                              <pre className="note">{o.note}</pre>
                            </div>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---- helpers (unchanged) ---- */
function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function fmtDate(ts) {
  const ms = tsToMillis(ts);
  if (!ms) return "";
  return new Date(ms).toLocaleString();
}
function fmtPHP(n) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);
  } catch {
    return `₱${Number(n) || 0}`;
  }
}
