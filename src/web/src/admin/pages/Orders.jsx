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
// ⬇️ add provider helpers (no CSS touched)
import {
  ensureShipmentForOrder,
  deleteShipmentsForOrder,
} from "../data/firebase/firebaseProvider";
import "../Orders.css";

/* --------------------------- constants --------------------------- */
const STATUS_OPTIONS = [
  { value: "processing", label: "Processing" },
  { value: "preparing", label: "Preparing" },
  { value: "to_ship", label: "To Ship" },
  { value: "to_receive", label: "To Receive" },
  { value: "completed", label: "Completed" },
  { value: "refund", label: "Refund / Return" },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

/* Per-section unique Delete button base colors (icon-only buttons use these) */
const clrOrders = "#d9534f";
const clrRepairs = "#b33939";
const clrCustom  = "#c62828";

/* Payment badge */
function paymentBadgeClass(ps) {
  const v = String(ps || "pending").toLowerCase();
  if (v === "paid") return "badge status-completed";
  if (v === "rejected") return "badge status-refund";
  if (v === "refunded") return "badge status-to-receive";
  return "badge status-processing";
}

/* Small icon-only danger button */
function IconTrashBtn({ color, title, disabled, onClick, style }) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      title={title || "Delete"}
      disabled={!!disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        border: `1px solid ${color}`,
        background: h && !disabled ? color : "#fff",
        color: h && !disabled ? "#fff" : color,
        fontSize: 18,
        lineHeight: "18px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        marginLeft: 6,
        ...style,
      }}
    >
      🗑
    </button>
  );
}

/* --------------------------- component --------------------------- */
export default function Orders() {
  const db = useMemo(() => getFirestore(auth.app), []);
  const [activeTab, setActiveTab] = useState("orders"); // 'orders' | 'repairs' | 'custom'

  /* -------- product orders state -------- */
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState({});
  const [draft, setDraft] = useState({});
  const [deleting, setDeleting] = useState({});
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  /* -------- repair orders state -------- */
  const [repairs, setRepairs] = useState([]);
  const [repairsLoading, setRepairsLoading] = useState(true);
  const [repairsErr, setRepairsErr] = useState("");
  const [repairsFilter, setRepairsFilter] = useState("all");
  const [repairsSaving, setRepairsSaving] = useState({});
  const [repairsDraft, setRepairsDraft] = useState({});
  const [repDeleting, setRepDeleting] = useState({});
  const [expandedRepairId, setExpandedRepairId] = useState(null);

  /* -------- customization orders state -------- */
  const [customs, setCustoms] = useState([]);
  const [customsLoading, setCustomsLoading] = useState(true);
  const [customsErr, setCustomsErr] = useState("");
  const [customsFilter, setCustomsFilter] = useState("all");
  const [customsSaving, setCustomsSaving] = useState({});
  const [customsDraft, setCustomsDraft] = useState({});
  const [customDeleting, setCustomDeleting] = useState({});
  const [expandedCustomId, setExpandedCustomId] = useState(null);

  /* -------- returns UI state (NEW) -------- */
  const [returnActing, setReturnActing] = useState({});      // { [orderId]: 'approve'|'reject'|'received'|'refund'|null }
  const [returnByOrderId, setReturnByOrderId] = useState({}); // cache of latest return doc per order

  /* ------------------- live subscriptions ------------------- */
  useEffect(() => {
    const qy = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const stop = onSnapshot(
      qy,
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

  useEffect(() => {
    const qy = query(collection(db, "repairs"), orderBy("createdAt", "desc"));
    const stop = onSnapshot(
      qy,
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

  useEffect(() => {
    const qy = query(collection(db, "custom_orders"), orderBy("createdAt", "desc"));
    const stop = onSnapshot(
      qy,
      (snap) => {
        setCustoms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCustomsLoading(false);
      },
      (e) => {
        console.error(e);
        setCustomsErr(e?.message || "Failed to load customization orders.");
        setCustomsLoading(false);
      }
    );
    return stop;
  }, [db]);

  /* ------------------- derived lists ------------------- */
  const productOrders = useMemo(() => rows.filter((o) => !o?.repairId), [rows]);

  const ordered = useMemo(() => {
    const sorted = [...productOrders].sort(
      (a, b) => tsToMillis(b?.createdAt) - tsToMillis(a?.createdAt)
    );
    if (filter === "all") return sorted;
    return sorted.filter((o) => (o?.status || "processing") === filter);
  }, [productOrders, filter]);

  const repairsOrdered = useMemo(() => {
    const sorted = [...repairs].sort(
      (a, b) => tsToMillis(b?.createdAt) - tsToMillis(a?.createdAt)
    );
    if (repairsFilter === "all") return sorted;
    return sorted.filter((r) => (r?.status || "processing") === repairsFilter);
  }, [repairs, repairsFilter]);

  const customsOrdered = useMemo(() => {
    const sorted = [...customs].sort(
      (a, b) => tsToMillis(b?.createdAt) - tsToMillis(a?.createdAt)
    );
    if (customsFilter === "all") return sorted;
    return sorted.filter((c) => (c?.status || "draft") === customsFilter);
  }, [customs, customsFilter]);

  /* ------------------- helpers (orders) ------------------- */
  const setOrderDraft = (id, status) => setDraft((prev) => ({ ...prev, [id]: status }));

  const saveStatus = async (id) => {
  const newStatus = draft[id];
  if (!newStatus) return;

  try {
    setSaving((prev) => ({ ...prev, [id]: true }));

    // find the current row so we can decide if we need to set deliveredAt
    const orderRow = rows.find((o) => o.id === id);

    // build the updates
    const updates = {
      status: newStatus,
      statusUpdatedAt: serverTimestamp(),
    };

    // When admin marks order as completed, start the return window
    if (newStatus === "completed" && !orderRow?.deliveredAt) {
      updates.deliveredAt = serverTimestamp();
      if (orderRow?.returnPolicyDays == null) {
        updates.returnPolicyDays = 7; // default policy days if not already present
      }
    }

    await updateDoc(doc(db, "orders", id), updates);

    // optimistic local state update
    setRows((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              status: newStatus,
              // reflect deliveredAt/returnPolicyDays optimistically in UI
              ...(updates.deliveredAt ? { deliveredAt: new Date() } : {}),
              ...(updates.returnPolicyDays != null
                ? { returnPolicyDays: updates.returnPolicyDays }
                : {}),
            }
          : o
      )
    );

    // ⬇️ Create (or reuse) a shipment when order moves to "to_ship"
    if (newStatus === "to_ship" && orderRow) {
      try {
        await ensureShipmentForOrder({ ...orderRow, id });
      } catch (e) {
        console.error("ensureShipmentForOrder failed", e);
      }
    }

    // existing notification code continues below (unchanged)...
    const uid = orderRow?.userId;
    if (uid) {
      const isRepairOrder = !!orderRow?.repairId;
      const firstItem = Array.isArray(orderRow?.items) ? orderRow.items[0] : null;

      await addDoc(collection(db, "users", uid, "notifications"), {
        type: isRepairOrder ? "repair_status" : "order_status",
        orderId: id,
        ...(isRepairOrder ? { repairId: orderRow.repairId } : {}),
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

      // ⬇️ Also remove any shipments (and their events) tied to this order
      try {
        await deleteShipmentsForOrder(orderId);
      } catch (e) {
        console.error("deleteShipmentsForOrder failed", e);
      }

      await deleteDoc(doc(db, "orders", orderId));
      setRows((prev) => prev.filter((o) => o.id !== orderId));
    } finally {
      setDeleting((p) => ({ ...p, [orderId]: false }));
    }
  }

  /* ------------------- helpers (returns) NEW ------------------- */
  async function getLatestReturnDoc(orderId) {
    const qy = query(collection(db, "returns"), where("orderId", "==", orderId));
    const snap = await getDocs(qy);
    let latest = null;
    snap.forEach((d) => {
      const r = { id: d.id, ...d.data() };
      const ts = (r.createdAt?.seconds ?? 0) * 1000;
      if (!latest || ts > ((latest?.createdAt?.seconds ?? 0) * 1000)) latest = r;
    });
    return latest;
  }

  async function primeReturnForOrder(orderId) {
    try {
      const r = await getLatestReturnDoc(orderId);
      setReturnByOrderId((p) => ({ ...p, [orderId]: r || null }));
    } catch (e) {
      console.warn("primeReturnForOrder:", e?.message || e);
    }
  }

  async function approveReturn(orderRow) {
    const id = orderRow.id;
    setReturnActing((p) => ({ ...p, [id]: "approve" }));
    try {
      const r = await getLatestReturnDoc(id);
      if (!r) return alert("No return request found for this order.");

      await updateDoc(doc(db, "returns", r.id), {
        status: "approved",
        approvedAt: serverTimestamp(),
      });

      if (orderRow.userId) {
        await addDoc(collection(db, "users", orderRow.userId, "notifications"), {
          type: "order_status",
          orderId: id,
          status: "refund",
          title: `Return approved for ${String(id).slice(0, 6)}`,
          body: "We’ve approved your return request. We’ll be in touch about pickup/next steps.",
          image: Array.isArray(orderRow.items)
            ? (orderRow.items[0]?.image || orderRow.items[0]?.img || null)
            : null,
          link: `/ordersummary?orderId=${id}`,
          createdAt: serverTimestamp(),
          read: false,
        });
      }
      await primeReturnForOrder(id);
    } finally {
      setReturnActing((p) => ({ ...p, [id]: null }));
    }
  }

  async function rejectReturn(orderRow) {
    const id = orderRow.id;
    setReturnActing((p) => ({ ...p, [id]: "reject" }));
    try {
      const r = await getLatestReturnDoc(id);
      if (!r) return alert("No return request found for this order.");
      const reason = prompt("Reason for rejection? (optional)") || "";
      await updateDoc(doc(db, "returns", r.id), {
        status: "rejected",
        rejectedAt: serverTimestamp(),
        reason,
      });

      if (orderRow.userId) {
        await addDoc(collection(db, "users", orderRow.userId, "notifications"), {
          type: "order_status",
          orderId: id,
          status: "refund",
          title: `Return rejected for ${String(id).slice(0, 6)}`,
          body: reason ? `Reason: ${reason}` : "Your return request was rejected.",
          image: Array.isArray(orderRow.items)
            ? (orderRow.items[0]?.image || orderRow.items[0]?.img || null)
            : null,
          link: `/ordersummary?orderId=${id}`,
          createdAt: serverTimestamp(),
          read: false,
        });
      }
      await primeReturnForOrder(id);
    } finally {
      setReturnActing((p) => ({ ...p, [id]: null }));
    }
  }

  async function markReturnReceived(orderRow) {
    const id = orderRow.id;
    setReturnActing((p) => ({ ...p, [id]: "received" }));
    try {
      const r = await getLatestReturnDoc(id);
      if (!r) return alert("No return request found for this order.");
      await updateDoc(doc(db, "returns", r.id), {
        status: "received",
        receivedAt: serverTimestamp(),
      });
      await primeReturnForOrder(id);
    } finally {
      setReturnActing((p) => ({ ...p, [id]: null }));
    }
  }

  async function issueRefund(orderRow) {
    const id = orderRow.id;
    setReturnActing((p) => ({ ...p, [id]: "refund" }));
    try {
      const r = await getLatestReturnDoc(id);
      if (!r) return alert("No return request found for this order.");

      const full = Number(orderRow.total || 0) || 0;
      const amount = Number(prompt("Refund amount (leave blank for full):", full)) || full;
      const method = prompt("Refund method (e.g., original payment method):", "original") || "original";

      await updateDoc(doc(db, "returns", r.id), {
        status: "refund_issued",
        refundAmount: amount,
        refundMethod: method,
        refundAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "orders", id), {
        paymentStatus: "refunded",
        returnLocked: true,
        statusUpdatedAt: serverTimestamp(),
      });

      if (orderRow.userId) {
        await addDoc(collection(db, "users", orderRow.userId, "notifications"), {
          type: "order_status",
          orderId: id,
          status: "refund",
          title: `Refund issued for ${String(id).slice(0, 6)}`,
          body: `We’ve issued your refund of ${amount}.`,
          image: Array.isArray(orderRow.items)
            ? (orderRow.items[0]?.image || orderRow.items[0]?.img || null)
            : null,
          link: `/ordersummary?orderId=${id}`,
          createdAt: serverTimestamp(),
          read: false,
        });
      }

      await primeReturnForOrder(id);
    } finally {
      setReturnActing((p) => ({ ...p, [id]: null }));
    }
  }

  /* ------------------- helpers (repairs) ------------------- */
  const setRepairDraft = (id, status) =>
    setRepairsDraft((prev) => ({ ...prev, [id]: status }));

  const saveRepairStatus = async (id) => {
    const newStatus = repairsDraft[id];
    if (!newStatus) return;

    try {
      setRepairsSaving((prev) => ({ ...prev, [id]: true }));

      // 1) Update repair doc
      await updateDoc(doc(db, "repairs", id), {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
      });

      setRepairs((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));

      // 2) Mirror to linked order (if any)
      const linkedOrder = rows.find((o) => o?.repairId === id);
      if (linkedOrder?.id) {
        await updateDoc(doc(db, "orders", linkedOrder.id), {
          status: newStatus,
          statusUpdatedAt: serverTimestamp(),
        });
        setRows((prev) =>
          prev.map((o) => (o.id === linkedOrder.id ? { ...o, status: newStatus } : o))
        );
      }

      // 3) Notify
      const repair = repairs.find((r) => r.id === id);
      const uid = repair?.userId;
      if (uid) {
        await addDoc(collection(db, "users", uid, "notifications"), {
          type: "repair_status",
          repairId: id,
          ...(linkedOrder?.id ? { orderId: linkedOrder.id } : {}),
          status: newStatus,
          title: `Repair order ${String(linkedOrder?.id || id).slice(0, 6)} status updated`,
          body: `Your repair order is now ${STATUS_LABEL[newStatus] || newStatus}.`,
          image: Array.isArray(repair?.images) ? repair.images[0] : null,
          link: linkedOrder?.id ? `/ordersummary?orderId=${linkedOrder.id}` : null,
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

  /* ------------------- helpers (customization) ------------------- */
  const setCustomDraft = (id, status) =>
    setCustomsDraft((prev) => ({ ...prev, [id]: status }));

  const saveCustomStatus = async (id) => {
    const newStatus = customsDraft[id];
    if (!newStatus) return;
    try {
      setCustomsSaving((p) => ({ ...p, [id]: true }));
      await updateDoc(doc(db, "custom_orders", id), {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
      });
      setCustoms((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));
    } catch (e) {
      alert(e?.message || "Failed to update status.");
    } finally {
      setCustomsSaving((p) => ({ ...p, [id]: false }));
    }
  };

  async function updateCustomPayment(id, newPayStatus) {
    try {
      await updateDoc(doc(db, "custom_orders", id), {
        paymentStatus: newPayStatus,
        paymentUpdatedAt: serverTimestamp(),
      });
      setCustoms((prev) =>
        prev.map((c) => (c.id === id ? { ...c, paymentStatus: newPayStatus } : c))
      );
    } catch (e) {
      alert(e?.message || "Failed to update payment status.");
    }
  }

  async function deleteCustomCascade(customId) {
    try {
      setCustomDeleting((p) => ({ ...p, [customId]: true }));
      await deleteDoc(doc(db, "custom_orders", customId));
      setCustoms((prev) => prev.filter((c) => c.id !== customId));
    } finally {
      setCustomDeleting((p) => ({ ...p, [customId]: false }));
    }
  }

  /* ------------------- UI helpers ------------------- */
  const TabButton = ({ id, label, count }) => (
    <button
      type="button"
      className={`chip ${activeTab === id ? "active" : ""}`}
      onClick={() => {
        setActiveTab(id);
        // collapse all expanded panels when switching tabs
        setExpandedOrderId(null);
        setExpandedRepairId(null);
        setExpandedCustomId(null);
      }}
      style={{ fontSize: 12 }}
    >
      {label}
      <span className="chip-count">{count}</span>
    </button>
  );

  const ViewButton = ({ rowId, open, onClick }) => (
    <button
      type="button"
      className="save-btn"
      onClick={() => {
        onClick();
        if (!open) primeReturnForOrder(rowId); // NEW: prime latest return doc when opening
      }}
      style={{ background: open ? "#6b7e76" : "#2c5f4a" }}
      title={open ? "Hide details" : "View details"}
    >
      {open ? "Hide" : "View"}
    </button>
  );

  return (
    <div className="admin-orders">
      {/* Tabs (three blocks right-aligned spacing preserved) */}
      <div className="orders-topbar" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <div className="status-toolbar"><TabButton id="orders" label="Orders" count={productOrders.length} /></div>
        <div className="status-toolbar"><TabButton id="repairs" label="Repair" count={repairs.length} /></div>
        <div className="status-toolbar"><TabButton id="custom" label="Customization" count={customs.length} /></div>
      </div>

      {/* ----------------------- ORDERS ----------------------- */}
      {activeTab === "orders" && (
        <>
          <div className="orders-topbar">
            <h2>Orders</h2>
            <div className="status-toolbar">
              {[{ key: "all", label: "All" }, ...STATUS_OPTIONS.map((s) => ({ key: s.value, label: s.label }))].map(
                (btn) => (
                  <button
                    key={btn.key}
                    className={`chip ${filter === btn.key ? "active" : ""}`}
                    onClick={() => {
                      setFilter(btn.key);
                      setExpandedOrderId(null);
                    }}
                    type="button"
                  >
                    {btn.label}
                    {btn.key !== "all" && (
                      <span className="chip-count">
                        {productOrders.filter((o) => (o?.status || "processing") === btn.key).length}
                      </span>
                    )}
                  </button>
                )
              )}
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
                      [o?.shippingAddress?.firstName, o?.shippingAddress?.lastName].filter(Boolean).join(" ") ||
                      o?.contactEmail ||
                      "—";
                    const itemsCount = Array.isArray(o?.items)
                      ? o.items.reduce((sum, it) => sum + (Number(it?.qty) || 1), 0)
                      : 0;
                    const total = fmtPHP(o?.total);
                    const status = String(o?.status || "processing");
                    const draftStatus = draft[id] ?? status;
                    const pay = String(o?.paymentStatus || "pending");
                    const isOpen = expandedOrderId === id;

                    return (
                      <React.Fragment key={id}>
                        <tr>
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
                              <span className={paymentBadgeClass(pay)}>{pay.toUpperCase()}</span>
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

                            {/* icon delete */}
                            <IconTrashBtn
                              color={clrOrders}
                              disabled={!!deleting[id]}
                              title="Delete order"
                              onClick={() => {
                                if (confirm("Delete this order? This cannot be undone.")) {
                                  deleteOrderCascade(id);
                                }
                              }}
                            />
                          </td>
                          <td>
                            <ViewButton
                              rowId={id}
                              open={isOpen}
                              onClick={() => setExpandedOrderId(isOpen ? null : id)}
                            />
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={8}>
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
                                    <option value="refunded">Refunded</option>
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
                                        <div className="item-title">{it?.title || it?.name || "Item"}</div>
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

                                {/* ---------- RETURN ACTIONS (NEW) ---------- */}
                                <div className="span-2">
                                  <h4>Return Actions</h4>
                                  {(() => {
                                    const r = returnByOrderId[o.id];
                                    const busy = !!returnActing[o.id];
                                    const Tag = ({ label }) => (
                                      <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>{label}</span>
                                    );
                                    return (
                                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <button
                                          className="save-btn"
                                          disabled={busy || !r || (r && r.status !== "requested")}
                                          onClick={() => approveReturn(o)}
                                          title="Approve return request"
                                        >
                                          {returnActing[o.id] === "approve" ? "Approving…" : "Approve"}
                                        </button>

                                        <button
                                          className="save-btn"
                                          disabled={busy || !r || (r && r.status !== "requested")}
                                          onClick={() => rejectReturn(o)}
                                          title="Reject return request"
                                          style={{ background: "#9ca3af" }}
                                        >
                                          {returnActing[o.id] === "reject" ? "Rejecting…" : "Reject"}
                                        </button>

                                        <button
                                          className="save-btn"
                                          disabled={busy || !r || !["approved","in_transit","out_for_delivery"].includes(r.status)}
                                          onClick={() => markReturnReceived(o)}
                                          title="Mark item received"
                                          style={{ background: "#6b7e76" }}
                                        >
                                          {returnActing[o.id] === "received" ? "Updating…" : "Mark Received"}
                                        </button>

                                        <button
                                          className="save-btn"
                                          disabled={busy || !r || !["received","approved"].includes(r.status)}
                                          onClick={() => issueRefund(o)}
                                          title="Issue refund and lock order"
                                          style={{ background: "#111827" }}
                                        >
                                          {returnActing[o.id] === "refund" ? "Issuing…" : "Issue Refund"}
                                        </button>

                                        <Tag label={r ? `Latest: ${r.status}` : "No request found"} />
                                      </div>
                                    );
                                  })()}
                                </div>
                                {/* ---------- /RETURN ACTIONS ---------- */}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ----------------------- REPAIRS ----------------------- */}
      {activeTab === "repairs" && (
        <>
          <div className="orders-topbar">
            <h2>Repair Orders</h2>
            <div className="status-toolbar">
              {[{ key: "all", label: "All" }, ...STATUS_OPTIONS.map((s) => ({ key: s.value, label: s.label }))].map(
                (btn) => (
                  <button
                    key={btn.key}
                    className={`chip ${repairsFilter === btn.key ? "active" : ""}`}
                    onClick={() => {
                      setRepairsFilter(btn.key);
                      setExpandedRepairId(null);
                    }}
                    type="button"
                  >
                    {btn.label}
                    {btn.key !== "all" && (
                      <span className="chip-count">
                        {repairs.filter((r) => (r?.status || "processing") === btn.key).length}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          </div>

          {repairsErr && <p className="err">{repairsErr}</p>}
          {repairsLoading && <p className="muted">Loading…</p>}
          {!repairsLoading && repairsOrdered.length === 0 && <p className="muted">No repair orders found.</p>}

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
                    const isOpen = expandedRepairId === id;

                    return (
                      <React.Fragment key={id}>
                        <tr>
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
                                {r.images.length > 4 && <span className="muted">+{r.images.length - 4}</span>}
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

                            <IconTrashBtn
                              color={clrRepairs}
                              disabled={!!repDeleting[id]}
                              title="Delete repair"
                              onClick={() => {
                                if (confirm("Delete this repair (and any linked order)? This cannot be undone.")) {
                                  deleteRepairCascade(id);
                                }
                              }}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="save-btn"
                              onClick={() => setExpandedRepairId(isOpen ? null : id)}
                              style={{ background: isOpen ? "#6b7e76" : "#2c5f4a" }}
                              title={isOpen ? "Hide details" : "View details"}
                            >
                              {isOpen ? "Hide" : "View"}
                            </button>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={11}>
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
                                      <option value="refunded">Refunded</option>
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
                                    <div className="mono strong">{fmtPHP(linkedOrder?.total ?? total)}</div>
                                  </div>
                                </div>

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
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ----------------------- CUSTOMIZATION ----------------------- */}
      {activeTab === "custom" && (
        <>
          <div className="orders-topbar">
            <h2>Customization Orders</h2>
            <div className="status-toolbar">
              {[{ key: "all", label: "All" }, { key: "draft", label: "Draft" }, ...STATUS_OPTIONS.map((s) => ({ key: s.value, label: s.label }))].map(
                (btn) => (
                  <button
                    key={btn.key}
                    className={`chip ${customsFilter === btn.key ? "active" : ""}`}
                    onClick={() => {
                      setCustomsFilter(btn.key);
                      setExpandedCustomId(null);
                    }}
                    type="button"
                  >
                    {btn.label}
                    <span className="chip-count">
                      {btn.key === "all"
                        ? customs.length
                        : customs.filter((c) => (c?.status || "draft") === btn.key).length}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>

          {customsErr && <p className="err">{customsErr}</p>}
          {customsLoading && <p className="muted">Loading…</p>}
          {!customsLoading && customsOrdered.length === 0 && <p className="muted">No customization orders found.</p>}

          {!customsLoading && customsOrdered.length > 0 && (
            <div className="orders-card">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Custom ID</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Size</th>
                    <th>Cover</th>
                    <th>Additionals</th>
                    <th>Images</th>
                    <th>Unit Price</th>
                    <th>Status</th>
                    <th width="1">Update</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {customsOrdered.map((c) => {
                    const id = c?.id || "";
                    const when = fmtDate(c?.createdAt);
                    const cust = c?.contactEmail || c?.userId || "—";
                    const images = Array.isArray(c?.images) ? c.images : [];
                    const unit = c?.unitPrice != null ? Number(c.unitPrice) : null;
                    const status = String(c?.status || "draft");
                    const draftStatus = customsDraft[id] ?? status;
                    const title = c?.productTitle || c?.title || c?.name || "—";
                    const isOpen = expandedCustomId === id;

                    return (
                      <React.Fragment key={id}>
                        <tr>
                          <td className="mono">{id}</td>
                          <td>{when}</td>
                          <td title={cust}>{cust}</td>
                          <td>{title}</td>
                          <td>{c?.category || "—"}</td>
                          <td>{c?.size || "—"}</td>
                          <td>{c?.cover ? `${c.cover.materialType || "—"} / ${c.cover.color || "—"}` : "—"}</td>
                          <td>
                            {Array.isArray(c?.additionals) && c.additionals.length
                              ? c.additionals.join(", ")
                              : "—"}
                          </td>
                          <td>
                            {images.length ? (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {images.slice(0, 3).map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noreferrer">
                                    <img
                                      src={url}
                                      alt={`Custom ${i + 1}`}
                                      style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
                                    />
                                  </a>
                                ))}
                                {images.length > 3 && <span className="muted">+{images.length - 3}</span>}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="mono strong">{unit != null ? fmtPHP(unit) : "—"}</td>
                          <td>
                            <span className={`badge status-${status === "draft" ? "processing" : status}`}>
                              {status === "draft" ? "DRAFT" : (STATUS_LABEL[status] || status).toUpperCase()}
                            </span>
                            {c?.paymentStatus && (
                              <div style={{ marginTop: 4 }}>
                                <span className={paymentBadgeClass(c.paymentStatus)}>
                                  {String(c.paymentStatus).toUpperCase()}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="nowrap">
                            <select
                              className="status-select"
                              value={draftStatus}
                              onChange={(e) => setCustomDraft(id, e.target.value)}
                            >
                              <option value="draft">Draft</option>
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              className="save-btn"
                              onClick={() => saveCustomStatus(id)}
                              disabled={customsSaving[id] || draftStatus === status}
                              type="button"
                              title={draftStatus === status ? "No changes" : "Save"}
                            >
                              {customsSaving[id] ? "Saving…" : "Save"}
                            </button>

                            {/* icon delete */}
                            <IconTrashBtn
                              color={clrCustom}
                              disabled={!!customDeleting[id]}
                              title="Delete customization order"
                              onClick={() => {
                                if (confirm("Delete this customization order? This cannot be undone.")) {
                                  deleteCustomCascade(id);
                                }
                              }}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="save-btn"
                              onClick={() => setExpandedCustomId(isOpen ? null : id)}
                              style={{ background: isOpen ? "#6b7e76" : "#2c5f4a" }}
                              title={isOpen ? "Hide details" : "View details"}
                            >
                              {isOpen ? "Hide" : "View"}
                            </button>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={13}>
                              <div className="details-grid">
                                {/* left group mirrors table content */}
                                <div>
                                  <div className="kv">
                                    <label>Product</label>
                                    <div>{title}</div>
                                  </div>
                                  <div className="kv">
                                    <label>Category</label>
                                    <div>{c?.category || "—"}</div>
                                  </div>
                                  <div className="kv">
                                    <label>Size</label>
                                    <div>{c?.size || "—"}</div>
                                  </div>
                                  <div className="kv">
                                    <label>Unit Price</label>
                                    <div className="mono strong">
                                      {unit != null ? fmtPHP(unit) : "—"}
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <div className="kv">
                                    <label>Cover</label>
                                    <div>
                                      {c?.cover
                                        ? `${c.cover.materialType || "—"} / ${c.cover.color || "—"}`
                                        : "—"}
                                    </div>
                                  </div>
                                  <div className="kv">
                                    <label>Additionals</label>
                                    <div>
                                      {Array.isArray(c?.additionals) && c.additionals.length
                                        ? c.additionals.join(", ")
                                        : "—"}
                                    </div>
                                  </div>
                                  <div className="kv">
                                    <label>Date</label>
                                    <div>{when}</div>
                                  </div>
                                </div>

                                {(c?.contactEmail || c?.userId) && (
                                  <div className="span-2">
                                    <h4>Customer</h4>
                                    <div className="muted">
                                      {c?.contactEmail ? `Email: ${c.contactEmail}` : null}
                                      {c?.userId ? (c?.contactEmail ? " • " : "") + `UID: ${c.userId}` : null}
                                    </div>
                                  </div>
                                )}

                                <div className="span-2">
                                  <h4>Payment Status</h4>
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <select
                                      className="status-select"
                                      value={c?.paymentStatus || "pending"}
                                      onChange={(e) => updateCustomPayment(id, e.target.value)}
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="paid">Paid</option>
                                      <option value="refunded">Refunded</option>
                                      <option value="rejected">Rejected</option>
                                    </select>
                                    {c?.paymentProofUrl ? (
                                      <a href={c.paymentProofUrl} target="_blank" rel="noreferrer">
                                        <img
                                          src={c.paymentProofUrl}
                                          alt="Payment Proof"
                                          style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }}
                                        />
                                      </a>
                                    ) : (
                                      <span className="muted">No proof uploaded</span>
                                    )}
                                  </div>
                                </div>

                                {images.length > 0 && (
                                  <div className="span-2">
                                    <h4>Images</h4>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {images.map((url, i) => (
                                        <a key={i} href={url} target="_blank" rel="noreferrer">
                                          <img
                                            src={url}
                                            alt={`Custom ${i + 1}`}
                                            style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8 }}
                                          />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {c?.descriptionFromProduct && (
                                  <div className="span-2">
                                    <h4>Description</h4>
                                    <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                                      {c.descriptionFromProduct}
                                    </div>
                                  </div>
                                )}

                                {c?.notes && (
                                  <div className="span-2">
                                    <h4>Notes</h4>
                                    <pre className="note">{c.notes}</pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* --------------------------- utils --------------------------- */
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
