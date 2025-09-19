// web/src/admin/pages/Orders.jsx
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
  getDocs,
  where,
  deleteDoc,
} from "firebase/firestore";
import "../Orders.css";

const STATUS_OPTIONS = [
  { value: "processing", label: "Processing" },
  { value: "preparing", label: "Preparing" },
  { value: "to_ship", label: "To Ship" },
  { value: "to_receive", label: "To Receive" },
  { value: "completed", label: "Completed" },
  { value: "refund", label: "Refund / Return" },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

function paymentBadgeClass(ps) {
  const v = String(ps || "pending").toLowerCase();
  if (v === "paid") return "badge status-completed";
  if (v === "rejected") return "badge status-refund";
  return "badge status-processing"; // pending/others
}

export default function Orders() {
  const db = useMemo(() => getFirestore(auth.app), []);

  // -------- Product orders state --------
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState({}); // { [orderId]: boolean }
  const [draft, setDraft] = useState({});   // { [orderId]: statusValue }
  const [deleting, setDeleting] = useState({}); // { [orderId]: boolean }

  // -------- Repair orders state --------
  const [repairs, setRepairs] = useState([]);
  const [repairsLoading, setRepairsLoading] = useState(true);
  const [repairsErr, setRepairsErr] = useState("");
  const [repairsFilter, setRepairsFilter] = useState("all");
  const [repairsSaving, setRepairsSaving] = useState({});   // { [repairId]: boolean }
  const [repairsDraft, setRepairsDraft] = useState({});     // { [repairId]: statusValue }
  const [repDeleting, setRepDeleting] = useState({});        // { [repairId]: boolean }

  // LIVE subscription to /orders (newest first)
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

  // LIVE subscription to /repairs (newest first)
  useEffect(() => {
    const q = query(collection(db, "repairs"), orderBy("createdAt", "desc"));
    const stop = onSnapshot(
      q,
      (snap) => {
        setRepairs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setRepairsLoading(false);
      },
      (e) => {
        console.error(e);
        setRepairsErr(e?.message || "Failed to load repair orders.");
        setRepairsLoading(false);
      }
    );
    return stop;
  }, [db]);

  // ------- Derived: product orders only (exclude repair-origin orders) -------
  const productOrders = useMemo(() => rows.filter((o) => !o?.repairId), [rows]);

  const ordered = useMemo(() => {
    const sorted = [...productOrders].sort(
      (a, b) => tsToMillis(b?.createdAt) - tsToMillis(a?.createdAt)
    );
    if (filter === "all") return sorted;
    return sorted.filter((o) => (o?.status || "processing") === filter);
  }, [productOrders, filter]);

  // ------- Derived: repair orders w/ filter -------
  const repairsOrdered = useMemo(() => {
    const sorted = [...repairs].sort(
      (a, b) => tsToMillis(b?.createdAt) - tsToMillis(a?.createdAt)
    );
    if (repairsFilter === "all") return sorted;
    return sorted.filter((r) => (r?.status || "processing") === repairsFilter);
  }, [repairs, repairsFilter]);

  // ------ product order helpers ------
  const setOrderDraft = (id, status) => setDraft((prev) => ({ ...prev, [id]: status }));

  const saveStatus = async (id) => {
    const newStatus = draft[id];
    if (!newStatus) return;

    try {
      setSaving((prev) => ({ ...prev, [id]: true }));

      await updateDoc(doc(db, "orders", id), {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
      });

      setRows((prev) => prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));

      const order = rows.find((o) => o.id === id);
      const uid = order?.userId;
      if (uid) {
        const isRepairOrder = !!order?.repairId;
        const firstItem = Array.isArray(order?.items) ? order.items[0] : null;

        await addDoc(collection(db, "users", uid, "notifications"), {
          type: isRepairOrder ? "repair_status" : "order_status",
          orderId: id,
          ...(isRepairOrder ? { repairId: order.repairId } : {}),
          status: newStatus,
          title: isRepairOrder
            ? `Repair order ${String(id).slice(0, 6)} status updated`
            : `Order ${String(id).slice(0, 6)} status updated`,
          body: isRepairOrder
            ? `Your repair order is now ${STATUS_LABEL[newStatus] || newStatus}.`
            : `Status is now ${STATUS_LABEL[newStatus] || newStatus}.`,
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

  // ------ delete helpers ------
  async function deleteUserNotifs(db, uid, { orderId = null, repairId = null } = {}) {
    if (!uid) return;
    const base = collection(db, "users", uid, "notifications");
    const qs = [];
    if (orderId) qs.push(query(base, where("orderId", "==", orderId)));
    if (repairId) qs.push(query(base, where("repairId", "==", repairId)));
    for (const qy of qs) {
      const snap = await getDocs(qy);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }
  }

  async function deleteOrderCascade(orderId, orderDataFromRows) {
    try {
      setDeleting((p) => ({ ...p, [orderId]: true }));
      const orderData = orderDataFromRows ?? rows.find((o) => o.id === orderId);

      if (orderData?.userId) {
        await deleteUserNotifs(db, orderData.userId, { orderId });
      }

      await deleteDoc(doc(db, "orders", orderId));
      setRows((prev) => prev.filter((o) => o.id !== orderId));
    } finally {
      setDeleting((p) => ({ ...p, [orderId]: false }));
    }
  }

  async function deleteRepairCascade(repairId) {
    try {
      setRepDeleting((p) => ({ ...p, [repairId]: true }));

      const repairData = repairs.find((r) => r.id === repairId);

      // delete linked order(s)
      const ordersQ = query(collection(db, "orders"), where("repairId", "==", repairId));
      const ordersSnap = await getDocs(ordersQ);
      for (const ord of ordersSnap.docs) {
        await deleteOrderCascade(ord.id, ord.data());
      }

      // delete repair notifications
      if (repairData?.userId) {
        await deleteUserNotifs(db, repairData.userId, { repairId });
      }

      // delete the repair doc
      await deleteDoc(doc(db, "repairs", repairId));
      setRepairs((prev) => prev.filter((r) => r.id !== repairId));
    } finally {
      setRepDeleting((p) => ({ ...p, [repairId]: false }));
    }
  }

  // ------ repair order helpers ------
  const setRepairDraft = (id, status) =>
    setRepairsDraft((prev) => ({ ...prev, [id]: status }));

  const saveRepairStatus = async (id) => {
    const newStatus = repairsDraft[id];
    if (!newStatus) return;

    try {
      setRepairsSaving((prev) => ({ ...prev, [id]: true }));

      // 1) Update the repair doc
      await updateDoc(doc(db, "repairs", id), {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
      });

      // Optimistically reflect locally
      setRepairs((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));

      // 2) Mirror to linked order (if any)
      const linkedOrder = rows.find((o) => o?.repairId === id);
      const orderId = linkedOrder?.id || null;
      if (orderId) {
        await updateDoc(doc(db, "orders", orderId), {
          status: newStatus,
          statusUpdatedAt: serverTimestamp(),
        });
        setRows((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
      }

      // 3) Notify with link to summary when the linked order exists
      const repair = repairs.find((r) => r.id === id);
      const uid = repair?.userId;
      if (uid) {
        await addDoc(collection(db, "users", uid, "notifications"), {
          type: "repair_status",
          repairId: id,
          ...(orderId ? { orderId } : {}),
          status: newStatus,
          title: `Repair order ${String(orderId || id).slice(0, 6)} status updated`,
          body: `Your repair order is now ${STATUS_LABEL[newStatus] || newStatus}.`,
          image: Array.isArray(repair?.images) ? repair.images[0] : null,
          link: orderId ? `/ordersummary?orderId=${orderId}` : null,
          createdAt: serverTimestamp(),
          read: false,
        });
      }
    } catch (e) {
      alert(e?.message || "Failed to update repair status.");
    } finally {
      setRepairsSaving((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="admin-orders">
      {/* ---------- PRODUCT ORDERS ---------- */}
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
                  {productOrders.filter((o) => (o?.status || "processing") === btn.key).length}
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
                const pay = String(o?.paymentStatus || "pending");

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
                      <div style={{ marginTop: 4 }}>
                        <span className={paymentBadgeClass(pay)}>
                          {pay.toUpperCase()}
                        </span>
                      </div>
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

                      {/* Delete order */}
                      <button
                        className="save-btn"
                        style={{ marginLeft: 6 }}
                        onClick={() => {
                          if (confirm("Delete this order? This cannot be undone.")) {
                            deleteOrderCascade(id);
                          }
                        }}
                        disabled={!!deleting[id]}
                        type="button"
                        title="Delete order"
                      >
                        {deleting[id] ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                    <td>
                      <details>
                        <summary>View</summary>

                        <div className="details-grid">
                          {o?.paymentProofUrl && (
                            <div className="span-2">
                              <h4>Payment Proof</h4>
                              <a href={o.paymentProofUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={o.paymentProofUrl}
                                  alt="Payment Proof"
                                  style={{ maxWidth: 200, borderRadius: 8 }}
                                />
                              </a>
                            </div>
                          )}

                          <div className="span-2">
                            <h4>Payment Status</h4>
                            <select
                              className="status-select"
                              value={o.paymentStatus || "pending"}
                              onChange={async (e) => {
                                const db2 = getFirestore(auth.app);
                                await updateDoc(doc(db2, "orders", o.id), {
                                  paymentStatus: e.target.value,
                                });
                              }}
                            >
                              <option value="pending">Pending</option>
                              <option value="paid">Paid</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </div>

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

      {/* ---------- REPAIR ORDERS ---------- */}
      <div className="orders-topbar" style={{ marginTop: 16 }}>
        <h2>Repair Orders</h2>
        <div className="status-toolbar">
          {[
            { key: "all", label: "All" },
            ...STATUS_OPTIONS.map((s) => ({ key: s.value, label: s.label })),
          ].map((btn) => (
            <button
              key={btn.key}
              className={`chip ${repairsFilter === btn.key ? "active" : ""}`}
              onClick={() => setRepairsFilter(btn.key)}
              type="button"
            >
              {btn.label}
              {btn.key !== "all" && (
                <span className="chip-count">
                  {repairs.filter((r) => (r?.status || "processing") === btn.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {repairsErr && <p className="err">{repairsErr}</p>}
      {repairsLoading && <p className="muted">Loading…</p>}
      {!repairsLoading && repairsOrdered.length === 0 && (
        <p className="muted">No repair orders found.</p>
      )}

      {!repairsLoading && repairsOrdered.length > 0 && (
        <div className="orders-card">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Repair ID</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Furniture</th>
                <th>Cover</th>
                <th>Frame</th>
                <th>Images</th>
                <th>Total</th>
                <th>Status</th>
                <th width="1">Update</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {repairsOrdered.map((r) => {
                const id = r?.id || "";
                const when = fmtDate(r?.createdAt);
                const name = r?.contactEmail || r?.userId || "—";
                const total =
                  Number(
                    r?.total ??
                      ((r?.typePrice || 0) +
                        (r?.coverMaterialPrice || 0) +
                        (r?.frameMaterialPrice || 0))
                  ) || 0;
                const status = String(r?.status || "processing");
                const draftStatus = repairsDraft[id] ?? status;

                const linkedOrder = rows.find((o) => o?.repairId === id);
                const paymentProofUrl = linkedOrder?.paymentProofUrl;
                const paymentStatus = linkedOrder?.paymentStatus || "pending";

                return (
                  <tr key={id}>
                    <td className="mono">{id}</td>
                    <td>{when}</td>
                    <td title={name}>{name}</td>
                    <td>{r?.typeLabel || r?.typeId || "—"}</td>
                    <td>{r?.coverMaterialLabel || r?.coverMaterialId || "—"}</td>
                    <td>{r?.frameMaterialLabel || r?.frameMaterialId || "—"}</td>
                    <td>
                      {Array.isArray(r?.images) && r.images.length ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {r.images.slice(0, 4).map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer">
                              <img
                                src={url}
                                alt={`Photo ${i + 1}`}
                                style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
                              />
                            </a>
                          ))}
                          {r.images.length > 4 && (
                            <span className="muted">+{r.images.length - 4}</span>
                          )}
                        </div>
                      ) : (
                        <span>{r?.imagesCount ?? 0}</span>
                      )}
                    </td>
                    <td className="mono strong">{fmtPHP(total)}</td>
                    <td>
                      <span className={`badge status-${status}`}>
                        {(STATUS_LABEL[status] || status).toUpperCase()}
                      </span>
                      {linkedOrder && (
                        <div style={{ marginTop: 4 }}>
                          <span className={paymentBadgeClass(paymentStatus)}>
                            {String(paymentStatus).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="nowrap">
                      <select
                        className="status-select"
                        value={draftStatus}
                        onChange={(e) => setRepairDraft(id, e.target.value)}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="save-btn"
                        onClick={() => saveRepairStatus(id)}
                        disabled={repairsSaving[id] || draftStatus === status}
                        type="button"
                        title={draftStatus === status ? "No changes" : "Save"}
                      >
                        {repairsSaving[id] ? "Saving…" : "Save"}
                      </button>

                      {/* Delete repair + linked docs */}
                      <button
                        className="save-btn"
                        style={{ marginLeft: 6 }}
                        onClick={() => {
                          if (confirm("Delete this repair (and any linked order)? This cannot be undone.")) {
                            deleteRepairCascade(id);
                          }
                        }}
                        disabled={!!repDeleting[id]}
                        type="button"
                        title="Delete repair"
                      >
                        {repDeleting[id] ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                    <td>
                      <details>
                        <summary>View</summary>
                        <div className="details-grid">
                          {paymentProofUrl && (
                            <div className="span-2">
                              <h4>Payment Proof</h4>
                              <a href={paymentProofUrl} target="_blank" rel="noreferrer">
                                <img
                                  src={paymentProofUrl}
                                  alt="Payment Proof"
                                  style={{ maxWidth: 200, borderRadius: 8 }}
                                />
                              </a>
                            </div>
                          )}

                          <div className="span-2">
                            <h4>Payment Status</h4>
                            {linkedOrder ? (
                              <select
                                className="status-select"
                                value={paymentStatus}
                                onChange={async (e) => {
                                  await updateDoc(doc(db, "orders", linkedOrder.id), {
                                    paymentStatus: e.target.value,
                                  });
                                }}
                              >
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                                <option value="rejected">Rejected</option>
                              </select>
                            ) : (
                              <div className="muted">No linked order yet.</div>
                            )}
                          </div>

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
                              <div className="mono strong">
                                {fmtPHP(linkedOrder?.total ?? total)}
                              </div>
                            </div>
                            {linkedOrder?.shippingFee != null && (
                              <div className="kv">
                                <label>Shipping Fee</label>
                                <div className="mono">{fmtPHP(linkedOrder.shippingFee)}</div>
                              </div>
                            )}
                          </div>

                          {Array.isArray(linkedOrder?.items) && linkedOrder.items.length > 0 && (
                            <div className="span-2">
                              <h4>Items</h4>
                              <ul className="items">
                                {linkedOrder.items.map((it, i) => (
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
                          )}

                          {Array.isArray(r?.images) && r.images.length > 0 && (
                            <div className="span-2">
                              <h4>Photos</h4>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {r.images.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noreferrer">
                                    <img
                                      src={url}
                                      alt={`Repair ${i + 1}`}
                                      style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8 }}
                                    />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {r?.notes && (
                            <div className="span-2">
                              <h4>Note</h4>
                              <pre className="note">{r.notes}</pre>
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

/* ---- helpers ---- */
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
