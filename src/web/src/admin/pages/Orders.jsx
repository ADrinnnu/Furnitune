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
import { getStorage } from "firebase/storage";
import { ref as sref, getDownloadURL as sGetURL } from "firebase/storage";
import { ensureShipmentForOrder, deleteShipmentsForOrder } from "../data/firebase/firebaseProvider";
import { upsertAssessmentAndRequest } from "../data/assessmentProvider";

import "../Orders.css";

/* ------------------------- Image resolver ------------------------- */
function ResolvedImg({ pathOrUrl, alt = "", size = 100 }) {
  const [url, setUrl] = React.useState(
    typeof pathOrUrl === "string" && pathOrUrl.startsWith("http") ? pathOrUrl : ""
  );

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      const val = String(pathOrUrl || "");
      if (!val) return;
      if (val.startsWith("http")) {
        if (!cancelled) setUrl(val);
        return;
      }
      try {
        const storage = getStorage(auth.app);
        const u = await sGetURL(sref(storage, val)); // val is fullPath like "payments/....jpg"
        if (!cancelled) setUrl(u);
      } catch {
        // ignore; image just won't show
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [pathOrUrl]);

  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt={alt}
        style={{
          width: size,
          height: size,
          objectFit: "cover",
          borderRadius: 8,
          border: "1px solid #e5e5e5",
        }}
      />
    </a>
  );
}

/* ========= helpers: status + badges ========= */
const STATUS_OPTIONS = [
  { value: "processing", label: "Processing" },
  { value: "preparing", label: "Preparing" },
  { value: "to_ship", label: "To Ship" },
  { value: "to_receive", label: "To Receive" },
  { value: "completed", label: "Completed" },
  { value: "refund", label: "Refund / Return" },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));
const clrOrders = "#d9534f";
const clrRepairs = "#b33939";
const clrCustom = "#c62828";

function paymentBadgeClass(ps) {
  const v = String(ps || "pending").toLowerCase();
  if (v === "paid") return "badge status-completed";
  if (v === "rejected") return "badge status-refund";
  if (v === "refunded") return "badge status-to-receive";
  if (v === "deposit_paid") return "badge status-preparing";
  if (v === "awaiting_additional_payment") return "badge status-to-receive";
  return "badge status-processing";
}

/* ========= robust date + reference image helpers ========= */
function pickDate(row) {
  const cands = [
    row?.createdAt,
    row?.created_at,
    row?.createdOn,
    row?.created_on,
    row?.timestamp,
    row?.timeCreated,
    row?.created,
    row?.createdAtClient,
    row?.createdAtMs,
    row?.created_at_ms,
    row?.date,
  ];
  for (const ts of cands) {
    if (ts == null) continue;
    if (typeof ts?.toDate === "function") return ts; // Firestore Timestamp
    if (typeof ts?.seconds === "number") return ts; // {seconds, nanos}
    if (typeof ts === "string" && !Number.isNaN(new Date(ts).getTime())) return ts; // ISO
    const n = Number(ts);
    if (!Number.isNaN(n) && n > 0) return n; // secs/millis
  }
  return null;
}
function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  if (typeof ts === "string") {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const n = Number(ts);
  if (!Number.isNaN(n)) return n > 1e12 ? n : n * 1000; // guess ms vs s
  return 0;
}
function fmtDate(tsLike) {
  const ms = tsToMillis(tsLike);
  return ms ? new Date(ms).toLocaleString() : "";
}
/** Finds customer-uploaded reference images by common keys. */
function pickCustomerReferenceImages(obj = {}) {
  const keys = [
    "referenceImages",
    "referenceImageUrls",
    "customerUploads",
    "customerUploadUrls",
    "customerImages",
    "refUrls",
    "refImages",
    "additionalImages",
    "additionalImageUrls",
  ];
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v) && v.length && v.every((u) => typeof u === "string")) return v;
  }
  return [];
}

/* ========= small UI bits ========= */
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

/* ========= Unified Customer block (labels + robust extraction) ========= */
function CustomerBlock({ row, title = "Customer" }) {
  // Prefer nested address objects, then fallbacks
  const addr =
    row?.shippingAddress ||
    row?.address ||
    row?.customer?.address ||
    row?.customerInfo?.address ||
    row?.customer_address ||
    {};

  const firstName =
    addr?.firstName ??
    addr?.firstname ??
    row?.firstName ??
    row?.firstname ??
    row?.customer?.firstName ??
    "";
  const lastName =
    addr?.lastName ??
    addr?.lastname ??
    row?.lastName ??
    row?.lastname ??
    row?.customer?.lastName ??
    "";
  const fullName =
    addr?.fullName ??
    addr?.name ??
    row?.nameFull ??
    row?.fullName ??
    row?.name ??
    row?.customer?.name ??
    [firstName, lastName].filter(Boolean).join(" ");

  const email =
    addr?.email ??
    row?.shippingAddress?.email ??
    row?.contactEmail ??
    row?.email ??
    row?.customer?.email ??
    row?.customerInfo?.email ??
    "";

  const phone =
    addr?.phone ??
    row?.contactPhone ??
    row?.phone ??
    row?.customer?.phone ??
    row?.customerInfo?.phone ??
    "";

  const line1 = addr?.line1 ?? addr?.address1 ?? row?.line1 ?? row?.address1 ?? "";
  const line2 = addr?.line2 ?? addr?.address2 ?? row?.line2 ?? row?.address2 ?? "";

  const city = addr?.city ?? row?.city ?? row?.shippingCity ?? row?.customer?.city ?? row?.customerInfo?.city ?? "";
  const province =
    addr?.province ?? addr?.state ?? row?.province ?? row?.state ?? row?.shippingProvince ?? "";
  const zip =
    addr?.zip ?? addr?.postalCode ?? addr?.postcode ?? row?.zip ?? row?.postalCode ?? row?.postcode ?? "";

  const country =
    addr?.country ??
    addr?.countryCode ??
    row?.country ??
    row?.shippingCountry ??
    row?.countryCode ??
    "";

  const uid = row?.userId ?? row?.uid ?? row?.customer?.uid ?? row?.customerInfo?.uid ?? "";

  return (
    <div className="span-2">
      <h4>{title}</h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px 1fr",
          gap: "8px 16px",
          alignItems: "center",
          maxWidth: 720,
        }}
      >
        <div className="kv">
          <label style={{ fontWeight: 600 }}>Name</label>
        </div>
        <div>{fullName || "—"}</div>

        <div className="kv">
          <label style={{ fontWeight: 600 }}>Email</label>
        </div>
        <div>{email || "—"}</div>

        <div className="kv">
          <label style={{ fontWeight: 600 }}>Phone</label>
        </div>
        <div>{phone || "—"}</div>

        <div className="kv">
          <label style={{ fontWeight: 600 }}>Address</label>
        </div>
        <div>{[line1, line2].filter(Boolean).join(", ") || "—"}</div>

        <div className="kv">
          <label style={{ fontWeight: 600 }}>City / Province / ZIP</label>
        </div>
        <div>{[city, province, zip].filter(Boolean).join(" · ") || "—"}</div>

        <div className="kv">
          <label style={{ fontWeight: 600 }}>Country</label>
        </div>
        <div>{country || "—"}</div>

        <div className="kv">
          <label style={{ fontWeight: 600 }}>User ID</label>
        </div>
        <div className="mono">{uid || "—"}</div>
      </div>
    </div>
  );
}

/* --------------------------- Assessment panel (unchanged) --------------------------- */
function AssessmentPanel({ kind, row }) {
  const [assessed, setAssessed] = useState(
    row?.assessedTotalCents != null ? Math.round(Number(row.assessedTotalCents) / 100) : ""
  );
  const [note, setNote] = useState(row?.assessmentNotes ?? "");
  const [amountPHP, setAmountPHP] = useState(
    row?.requestedAdditionalPaymentCents != null
      ? Math.round(Number(row.requestedAdditionalPaymentCents) / 100)
      : ""
  );
  const dep = Number(row?.depositCents || 0);
  const adds = Number(row?.additionalPaymentsCents || 0);
  const refs = Number(row?.refundsCents || 0);
  const assessedC = Math.round(Number(assessed || 0) * 100);
  const netPaid = dep + adds - refs;
  const balance = assessedC > 0 ? Math.max(0, assessedC - netPaid) : 0;

  const setToBalance = () => setAmountPHP(Math.round(balance / 100));

  return (
    <div className="span-2">
      <h4>Finalize & Request Payment</h4>

      <div className="kv">
        <label>Final Total (₱)</label>
        <input
          className="status-select"
          type="number"
          value={assessed}
          onChange={(e) => setAssessed(e.target.value)}
          placeholder="e.g. 43441"
        />
      </div>

      <div className="kv">
        <label>Request amount now (₱)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="status-select"
            type="number"
            value={amountPHP}
            onChange={(e) => setAmountPHP(e.target.value)}
            placeholder="leave blank to request computed balance"
          />
          <button className="save-btn" type="button" onClick={setToBalance}>
            Use Balance (₱{(balance / 100).toLocaleString()})
          </button>
        </div>
      </div>

      <div className="kv">
        <label>Message to customer</label>
        <textarea
          className="note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Explain why the additional amount is needed"
        />
      </div>

      <div className="muted small" style={{ marginTop: 6 }}>
        Deposit: <b>₱{(dep / 100).toLocaleString()}</b> · Add’l:{" "}
        <b>₱{(adds / 100).toLocaleString()}</b> · Refunds: <b>₱{(refs / 100).toLocaleString()}</b> · Computed
        Balance: <b>₱{(balance / 100).toLocaleString()}</b>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          className="save-btn"
          onClick={async () => {
            const assessedCents = Math.max(0, Math.round(Number(assessed || 0) * 100));
            const requestCents =
              amountPHP === "" ? null : Math.max(0, Math.round(Number(amountPHP || 0) * 100));
            await upsertAssessmentAndRequest({
              kind,
              id: row.id,
              assessedTotalCents: assessedCents,
              requestAmountCents: requestCents, // null → use computed balance
              note,
            });
            alert("Assessment saved and request sent.");
          }}
        >
          Save & Send Request
        </button>
      </div>

      {row?.lastAdditionalPaymentProofUrl && (
        <div className="span-2" style={{ marginTop: 12 }}>
          <h4>Latest Additional Payment Proof</h4>
          <a href={row.lastAdditionalPaymentProofUrl} target="_blank" rel="noreferrer">
            <img
              src={row.lastAdditionalPaymentProofUrl}
              alt="Additional Payment Proof"
              style={{ maxWidth: 200, borderRadius: 8 }}
            />
          </a>
        </div>
      )}
    </div>
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

  /* -------- returns UI state -------- */
  const [returnActing, setReturnActing] = useState({});
  const [returnByOrderId, setReturnByOrderId] = useState({});

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

  /* ------------------- derived lists (date-aware) ------------------- */
  const productOrders = useMemo(
    () =>
      rows.filter((o) => !o?.repairId && String(o?.origin || "catalog") !== "customization"),
    [rows]
  );

  const ordered = useMemo(() => {
    const sorted = [...productOrders].sort(
      (a, b) => tsToMillis(pickDate(b)) - tsToMillis(pickDate(a))
    );
    if (filter === "all") return sorted;
    return sorted.filter((o) => (o?.status || "processing") === filter);
  }, [productOrders, filter]);

  const repairsOrdered = useMemo(() => {
    const sorted = [...repairs].sort((a, b) => tsToMillis(pickDate(b)) - tsToMillis(pickDate(a)));
    if (repairsFilter === "all") return sorted;
    return sorted.filter((r) => (r?.status || "processing") === repairsFilter);
  }, [repairs, repairsFilter]);

  const customsOrdered = useMemo(() => {
    const sorted = [...customs].sort((a, b) => tsToMillis(pickDate(b)) - tsToMillis(pickDate(a)));
    if (customsFilter === "all") return sorted;
    return sorted.filter((c) => (c?.status || "draft") === customsFilter);
  }, [customs, customsFilter]);

  /* ------------------- money/date formatters ------------------- */
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

  /* ------------------- payment helpers (unchanged) ------------------- */
  async function updateOrderPayment(orderId, currentRow, nextStatus) {
    const db2 = getFirestore(auth.app);
    const val = String(nextStatus || "").toLowerCase();

    const patch = { paymentStatus: val, paymentUpdatedAt: serverTimestamp() };
    if (val === "paid" && !currentRow?.paidAt) patch.paidAt = serverTimestamp();
    if (val === "refunded") patch.refundedAt = serverTimestamp();

    if (val === "deposit_paid") {
      const defaultPHP = Math.round(Number(currentRow?.total || 0));
      const ans = prompt(
        `Enter initial payment amount (₱).\nThis will be shown to the customer as “Deposit”.`,
        String(defaultPHP || "")
      );
      if (ans !== null && ans !== "") {
        const pesos = Math.max(0, Math.round(Number(ans || 0)));
        patch.depositCents = pesos * 100;
      }
    }

    if (val === "paid" && currentRow?.depositCents == null) {
      const defaultPHP = Math.round(
        Number(
          currentRow?.assessedTotalCents != null
            ? currentRow.assessedTotalCents / 100
            : currentRow?.total || 0
        )
      );
      const ans = prompt(
        `Record the total amount received (₱)?\n(Optional, helps the Payment Summary match “Paid”.)`,
        String(defaultPHP || "")
      );
      if (ans !== null && ans !== "") {
        const pesos = Math.max(0, Math.round(Number(ans || 0)));
        patch.depositCents = pesos * 100;
      }
    }

    await updateDoc(doc(db2, "orders", orderId), patch);
    setRows((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
  }

  async function updateRepairPayment(repairId, currentRepairRow, nextStatus) {
    const db2 = getFirestore(auth.app);
    const val = String(nextStatus || "").toLowerCase();

    const patch = { paymentStatus: val, paymentUpdatedAt: serverTimestamp() };
    if (val === "paid" && !currentRepairRow?.paidAt) patch.paidAt = serverTimestamp();
    if (val === "refunded") patch.refundedAt = serverTimestamp();

    const linkedOrder = rows.find((o) => o?.repairId === repairId);

    if (val === "deposit_paid" && linkedOrder?.id) {
      const defaultPHP = Math.round(Number(linkedOrder?.total || 0));
      const ans = prompt(
        `Enter initial payment amount (₱) for this repair order.\nThis will be shown to the customer as “Deposit”.`,
        String(defaultPHP || "")
      );
      const orderPatch = { paymentStatus: val, paymentUpdatedAt: serverTimestamp() };
      if (ans !== null && ans !== "") {
        const pesos = Math.max(0, Math.round(Number(ans || 0)));
        orderPatch.depositCents = pesos * 100;
      }
      await updateDoc(doc(db2, "orders", linkedOrder.id), orderPatch);
      setRows((prev) => prev.map((o) => (o.id === linkedOrder.id ? { ...o, ...orderPatch } : o)));
    }

    if (val === "paid" && linkedOrder?.id && linkedOrder?.depositCents == null) {
      const defaultPHP = Math.round(
        Number(
          linkedOrder?.assessedTotalCents != null
            ? linkedOrder.assessedTotalCents / 100
            : linkedOrder?.total || 0
        )
      );
      const ans = prompt(
        `Record the total amount received (₱) for this repair order?`,
        String(defaultPHP || "")
      );
      if (ans !== null && ans !== "") {
        const pesos = Math.max(0, Math.round(Number(ans || 0)));
        const orderPatch = {
          paymentStatus: val,
          paymentUpdatedAt: serverTimestamp(),
          depositCents: pesos * 100,
          paidAt: serverTimestamp(),
        };
        await updateDoc(doc(db2, "orders", linkedOrder.id), orderPatch);
        setRows((prev) => prev.map((o) => (o.id === linkedOrder.id ? { ...o, ...orderPatch } : o)));
      }
    }

    await updateDoc(doc(db2, "repairs", repairId), patch);
    setRepairs((prev) => prev.map((r) => (r.id === repairId ? { ...r, ...patch } : r)));
  }

  const setOrderDraft = (id, status) => setDraft((prev) => ({ ...prev, [id]: status }));

  const saveStatus = async (id) => {
    const newStatus = draft[id];
    if (!newStatus) return;

    try {
      setSaving((prev) => ({ ...prev, [id]: true }));

      const orderRow = rows.find((o) => o.id === id);

      const updates = {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
      };

      if (newStatus === "completed" && !orderRow?.deliveredAt) {
        updates.deliveredAt = serverTimestamp();
        if (orderRow?.returnPolicyDays == null) {
          updates.returnPolicyDays = 7;
        }
      }

      await updateDoc(doc(db, "orders", id), updates);

      setRows((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                status: newStatus,
                ...(updates.deliveredAt ? { deliveredAt: new Date() } : {}),
                ...(updates.returnPolicyDays != null
                  ? { returnPolicyDays: updates.returnPolicyDays }
                  : {}),
              }
            : o
        )
      );

      if (newStatus === "to_ship" && orderRow) {
        try {
          await ensureShipmentForOrder({ ...orderRow, id });
        } catch (e) {
          console.error("ensureShipmentForOrder failed", e);
        }
      }

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

  /* ---- notifications helpers for deletes (unchanged) ---- */
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

  // --- helper: delete a subcollection under a parent doc ---
async function deleteSubcollection(db, parentColl, parentId, subcoll) {
  const subRef = collection(db, parentColl, parentId, subcoll);
  const snap = await getDocs(subRef);
  const tasks = snap.docs.map(d => deleteDoc(d.ref));
  await Promise.all(tasks);
}

  async function deleteOrderCascade(orderId, orderDataFromRows) {
  setDeleting((p) => ({ ...p, [orderId]: true }));
  try {
    const orderData = orderDataFromRows ?? rows.find((o) => o.id === orderId);

    if (orderData?.userId) {
      await deleteUserNotifs(db, orderData.userId, { orderId });
    }

    try {
      await deleteShipmentsForOrder(orderId);
    } catch (e) {
      console.error("deleteShipmentsForOrder failed", e);
    }

    // 🔻 NEW: remove known subcollections under this order
    await deleteSubcollection(db, "orders", orderId, "events");

    // finally remove the order doc itself
    await deleteDoc(doc(db, "orders", orderId));

    setRows((prev) => prev.filter((o) => o.id !== orderId));
  } catch (e) {
    console.error("deleteOrderCascade failed:", e);
    alert(e?.message || "Failed to delete order. Make sure your account is admin.");
  } finally {
    setDeleting((p) => ({ ...p, [orderId]: false }));
  }
}


  /* ---- returns helpers (unchanged) ---- */
  async function getLatestReturnDoc(orderId) {
    const qy = query(collection(db, "returns"), where("orderId", "==", orderId));
    const snap = await getDocs(qy);
    let latest = null;
    snap.forEach((d) => {
      const r = { id: d.id, ...d.data() };
      const ts = (r.createdAt?.seconds ?? 0) * 1000;
      if (!latest || ts > (latest?.createdAt?.seconds ?? 0) * 1000) latest = r;
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
            ? orderRow.items[0]?.image || orderRow.items[0]?.img || null
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
            ? orderRow.items[0]?.image || orderRow.items[0]?.img || null
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
        refundedCents: Math.round(Number(amount || 0) * 100),
        refundedAt: serverTimestamp(),
      });

      if (orderRow.userId) {
        await addDoc(collection(db, "users", orderRow.userId, "notifications"), {
          type: "order_status",
          orderId: id,
          status: "refund",
          title: `Refund issued for ${String(id).slice(0, 6)}`,
          body: `We’ve issued your refund of ${amount}.`,
          image: Array.isArray(orderRow.items)
            ? orderRow.items[0]?.image || orderRow.items[0]?.img || null
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
  const setRepairDraft = (id, status) => setRepairsDraft((prev) => ({ ...prev, [id]: status }));

  const saveRepairStatus = async (id) => {
    const newStatus = repairsDraft[id];
    if (!newStatus) return;

    try {
      setRepairsSaving((prev) => ({ ...prev, [id]: true }));

      await updateDoc(doc(db, "repairs", id), {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
      });

      setRepairs((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));

      const linkedOrder = rows.find((o) => o?.repairId === id);
      if (linkedOrder?.id) {
        await updateDoc(doc(db, "orders", linkedOrder.id), {
          status: newStatus,
          statusUpdatedAt: serverTimestamp(),
        });
        setRows((prev) => prev.map((o) => (o.id === linkedOrder.id ? { ...o, status: newStatus } : o)));
      }

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
    setRepDeleting((p) => ({ ...p, [repairId]: true }));
    try {
      const repairData = repairs.find((r) => r.id === repairId);

      const ordersQ = query(collection(db, "orders"), where("repairId", "==", repairId));
      const ordersSnap = await getDocs(ordersQ);
      for (const ord of ordersSnap.docs) {
        await deleteOrderCascade(ord.id, ord.data());
      }

      if (repairData?.userId) {
        await deleteUserNotifs(db, repairData.userId, { repairId });
      }

      await deleteDoc(doc(db, "repairs", repairId));
      setRepairs((prev) => prev.filter((r) => r.id !== repairId));
    } catch (e) {
      console.error("deleteRepairCascade failed:", e);
      alert(e?.message || "Failed to delete repair. Make sure your account is admin.");
    } finally {
      setRepDeleting((p) => ({ ...p, [repairId]: false }));
    }
  }

  /* ------------------- helpers (customization) ------------------- */
  const setCustomDraft = (id, status) => setCustomsDraft((prev) => ({ ...prev, [id]: status }));

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
      setCustoms((prev) => prev.map((c) => (c.id === id ? { ...c, paymentStatus: newPayStatus } : c)));
    } catch (e) {
      alert(e?.message || "Failed to update payment status.");
    }
  }

  async function deleteCustomCascade(customId) {
    setCustomDeleting((p) => ({ ...p, [customId]: true }));
    try {
      await deleteDoc(doc(db, "custom_orders", customId));
      setCustoms((prev) => prev.filter((c) => c.id !== customId));
    } catch (e) {
      console.error("deleteCustomCascade failed:", e);
      alert(e?.message || "Failed to delete customization order. Make sure your account is admin.");
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
        if (!open) primeReturnForOrder(rowId);
      }}
      style={{ background: open ? "#6b7e76" : "#2c5f4a" }}
      title={open ? "Hide details" : "View details"}
    >
      {open ? "Hide" : "View"}
    </button>
  );

  /* ------------------- render ------------------- */
  return (
    <div className="admin-orders">
      {/* Tabs */}
      <div className="orders-topbar" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <div className="status-toolbar">
          <TabButton id="orders" label="Orders" count={productOrders.length} />
        </div>
        <div className="status-toolbar">
          <TabButton id="repairs" label="Repair" count={repairs.length} />
        </div>
        <div className="status-toolbar">
          <TabButton id="custom" label="Customization" count={customs.length} />
        </div>
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
                    const when = fmtDate(pickDate(o));
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
                                {/* ✅ Initial payment proof (URL or storage path) */}
                                {(o?.paymentProofUrl || o?.paymentProofPath) && (
                                  <div className="span-2">
                                    <h4>Initial Payment Proof</h4>
                                    <ResolvedImg
                                      pathOrUrl={o.paymentProofUrl || o.paymentProofPath}
                                      alt="Initial Payment Proof"
                                      size={200}
                                    />
                                  </div>
                                )}

                                {/* ✅ Additional payment proof (URL or storage path) */}
                                {(o?.lastAdditionalPaymentProofUrl || o?.lastAdditionalPaymentProofPath) && (
                                  <div className="span-2">
                                    <h4>Additional Payment Proof</h4>
                                    <ResolvedImg
                                      pathOrUrl={
                                        o.lastAdditionalPaymentProofUrl || o.lastAdditionalPaymentProofPath
                                      }
                                      alt="Additional Payment Proof"
                                      size={200}
                                    />
                                  </div>
                                )}

                                <div className="span-2">
                                  <h4>Payment Status</h4>
                                  <select
                                    className="status-select"
                                    value={o.paymentStatus || "pending"}
                                    onChange={(e) => updateOrderPayment(o.id, o, e.target.value)}
                                  >
                                    <option value="pending">Pending</option>
                                    <option value="deposit_paid">Deposit_Paid</option>
                                    <option value="awaiting_additional_payment">Awaiting_Additional_Payment</option>
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

                                {/* ✅ Customer */}
                                <CustomerBlock title="Customer" row={o} />

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

                                {/* Return actions block kept as-is */}
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
                                          disabled={
                                            busy || !r || !["approved", "in_transit", "out_for_delivery"].includes(r.status)
                                          }
                                          onClick={() => markReturnReceived(o)}
                                          title="Mark item received"
                                          style={{ background: "#6b7e76" }}
                                        >
                                          {returnActing[o.id] === "received" ? "Updating…" : "Mark Received"}
                                        </button>

                                        <button
                                          className="save-btn"
                                          disabled={busy || !r || !["received", "approved"].includes(r.status)}
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
                    const when = fmtDate(pickDate(r));
                    const name = r?.contactEmail || r?.userId || "—";
                    const total =
                      Number(
                        r?.total ??
                          (r?.typePrice || 0) + (r?.coverMaterialPrice || 0) + (r?.frameMaterialPrice || 0)
                      ) || 0;
                    const status = String(r?.status || "processing");
                    const draftStatus = repairsDraft[id] ?? status;

                    const linkedOrder = rows.find((o) => o?.repairId === id);
                    const paymentStatus = linkedOrder?.paymentStatus || r?.paymentStatus || "pending";
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
                            <div style={{ marginTop: 4 }}>
                              <span className={paymentBadgeClass(paymentStatus)}>
                                {String(paymentStatus).toUpperCase()}
                              </span>
                            </div>
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
                                {/* ✅ Initial payment proof from linked order or repair (URL or storage path) */}
                                {(linkedOrder?.paymentProofUrl ||
                                  linkedOrder?.paymentProofPath ||
                                  r?.paymentProofUrl ||
                                  r?.paymentProofPath) && (
                                  <div className="span-2">
                                    <h4>Initial Payment Proof</h4>
                                    <ResolvedImg
                                      pathOrUrl={
                                        linkedOrder?.paymentProofUrl ||
                                        linkedOrder?.paymentProofPath ||
                                        r?.paymentProofUrl ||
                                        r?.paymentProofPath
                                      }
                                      alt="Initial Payment Proof"
                                      size={200}
                                    />
                                  </div>
                                )}

                                {/* ✅ Additional payment proof from linked order (URL or storage path) */}
                                {(linkedOrder?.lastAdditionalPaymentProofUrl ||
                                  linkedOrder?.lastAdditionalPaymentProofPath) && (
                                  <div className="span-2">
                                    <h4>Additional Payment Proof</h4>
                                    <ResolvedImg
                                      pathOrUrl={
                                        linkedOrder?.lastAdditionalPaymentProofUrl ||
                                        linkedOrder?.lastAdditionalPaymentProofPath
                                      }
                                      alt="Additional Payment Proof"
                                      size={200}
                                    />
                                  </div>
                                )}

                                <div className="span-2">
                                  <h4>Payment Status</h4>
                                  {linkedOrder ? (
                                    <select
                                      className="status-select"
                                      value={linkedOrder?.paymentStatus || "pending"}
                                      onChange={(e) => updateOrderPayment(linkedOrder.id, linkedOrder, e.target.value)}
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="deposit_paid">Deposit_Paid</option>
                                      <option value="awaiting_additional_payment">Awaiting_Additional_Payment</option>
                                      <option value="paid">Paid</option>
                                      <option value="refunded">Refunded</option>
                                      <option value="rejected">Rejected</option>
                                    </select>
                                  ) : (
                                    <select
                                      className="status-select"
                                      value={r?.paymentStatus || "pending"}
                                      onChange={(e) => updateRepairPayment(id, r, e.target.value)}
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="deposit_paid">Deposit_Paid</option>
                                      <option value="awaiting_additional_payment">Awaiting_Additional_Payment</option>
                                      <option value="paid">Paid</option>
                                      <option value="refunded">Refunded</option>
                                      <option value="rejected">Rejected</option>
                                    </select>
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

                                {/* ✅ Customer for repair */}
                                <CustomerBlock title="Customer" row={r} />

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
                                    <h4>Notes</h4>
                                    <pre className="note">{r.notes}</pre>
                                  </div>
                                )}

                                <AssessmentPanel kind="repair" row={r} />
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
          {!customsLoading && customsOrdered.length === 0 && (
            <p className="muted">No customization orders found.</p>
          )}

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
                    const when = fmtDate(pickDate(c));
                    const cust = c?.contactEmail || c?.userId || "—";
                    const images = Array.isArray(c?.images) ? c.images : [];
                    const refImgs = pickCustomerReferenceImages(c);
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
                            {Array.isArray(c?.additionals) && c.additionals.length ? c.additionals.join(", ") : "—"}
                          </td>
                          <td>
                            {images.length || refImgs.length ? (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {[...images, ...refImgs].slice(0, 3).map((url, i) => (
                                  <ResolvedImg key={i} pathOrUrl={url} alt={`Custom ${i + 1}`} size={40} />
                                ))}
                                {[...images, ...refImgs].length > 3 && (
                                  <span className="muted">+{[...images, ...refImgs].length - 3}</span>
                                )}
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
                                <div className="span-2">
                                  <h4>Payment Status</h4>
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <select
                                      className="status-select"
                                      value={c?.paymentStatus || "pending"}
                                      onChange={(e) => updateCustomPayment(id, e.target.value)}
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="deposit_paid">Deposit_Paid</option>
                                      <option value="awaiting_additional_payment">Awaiting_Additional_Payment</option>
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
                                    <div className="mono strong">{unit != null ? fmtPHP(unit) : "—"}</div>
                                  </div>
                                </div>

                                <div>
                                  <div className="kv">
                                    <label>Cover</label>
                                    <div>
                                      {c?.cover ? `${c.cover.materialType || "—"} / ${c.cover.color || "—"}` : "—"}
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

                                {/* ✅ Customer for custom */}
                                <CustomerBlock title="Customer" row={c} />

                                {images.length > 0 && (
                                  <div className="span-2">
                                    <h4>Product Images</h4>
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

                                {refImgs.length > 0 && (
                                  <div className="span-2">
                                    <h4>Reference Images (customer)</h4>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {refImgs.map((url, i) => (
                                        <ResolvedImg key={i} pathOrUrl={url} alt={`Reference ${i + 1}`} size={100} />
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

                                <AssessmentPanel kind="custom" row={c} />
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
