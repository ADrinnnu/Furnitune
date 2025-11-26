import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../firebase";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  deleteDoc,
  writeBatch,
  where,
  limit,
} from "firebase/firestore";
import { getStorage, ref as sref, getDownloadURL as sGetURL } from "firebase/storage";
import { ensureShipmentForOrder, deleteShipmentsForOrder } from "../data/firebase/firebaseProvider";
import { upsertAssessmentAndRequest } from "../data/assessmentProvider";
import "../Orders.css";


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
        const u = await sGetURL(sref(storage, val));
        if (!cancelled) setUrl(u);
      } catch {}
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


const STATUS_OPTIONS = [
  { value: "processing", label: "Processing" },
  { value: "preparing", label: "Preparing" },
  { value: "to_ship", label: "To Ship" },
  { value: "to_receive", label: "To Receive" },
  { value: "to_rate", label: "To Rate" },
  { value: "completed", label: "Completed" },
  { value: "refund", label: "Refund / Return" },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));


const SHIPPING_DRIVEN_STATUSES = new Set(["to_receive", "to_rate", "completed"]);

const clrOrders = "#d9534f";
const clrRepairs = "#b33939";
const clrCustom = "#c62828";


function paymentBadgeClass(ps) {
  const v = String(ps || "pending").toLowerCase();
  if (v === "paid") return "badge status-completed";
  if (v === "rejected") return "badge status-refund";
  if (v === "refunded") return "badge status-refund"; 
  if (v === "deposit_paid") return "badge status-preparing";
  if (v === "awaiting_additional_payment") return "badge status-to-receive";
  return "badge status-processing";
}

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
    if (typeof ts?.toDate === "function") return ts;
    if (typeof ts?.seconds === "number") return ts;
    if (typeof ts === "string" && !Number.isNaN(new Date(ts).getTime())) return ts;
    const n = Number(ts);
    if (!Number.isNaN(n)) return n;
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
  if (!Number.isNaN(n)) return n > 1e12 ? n : n * 1000;
  return 0;
}
function fmtDate(tsLike) {
  const ms = tsToMillis(tsLike);
  return ms ? new Date(ms).toLocaleString() : "";
}
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


function fmtAdditionals(adds) {
  if (!adds) return "";
  const arr = Array.isArray(adds) ? adds : [adds];
  const label = (a) =>
    typeof a === "string"
      ? a
      : a?.label || a?.name || a?.title || a?.id || a?.type || "";
  return arr.map(label).filter(Boolean).join(", ");
}


const toCents = (php) => Math.max(0, Math.round(Number(php || 0) * 100));
const N = (x) => Math.max(0, Math.round(Number(x || 0)));

function assessedCentsFrom(row) {
  if (row?.assessedTotalCents != null) return N(row.assessedTotalCents);
  const unit = Number(row?.unitPrice || 0);
  const ship = Number(row?.shippingFee || 0);
  if (row?.total != null) return toCents(row.total);
  return toCents(unit + ship);
}
function computeMonies(row) {
  const assessed = assessedCentsFrom(row);
  const dep = N(row?.depositCents);
  const adds = N(row?.additionalPaymentsCents);
  const refs = N(row?.refundsCents);
  const netPaid = Math.max(0, dep + adds - refs);
  const balance = assessed > 0 ? Math.max(0, assessed - netPaid) : 0;
  const shipPHP = Number(row?.shippingFee || 0);
  const unitPHP = Number(row?.unitPrice || 0);
  const displayTotalPHP =
    row?.total != null ? Number(row.total) : unitPHP + shipPHP;
  return {
    assessed,
    dep,
    adds,
    refs,
    netPaid,
    balance,
    unitPHP,
    shipPHP,
    displayTotalPHP,
  };
}
async function ensureOrderForRepair(db, repairRow) {
  if (!repairRow?.id) return null;
  const qy = query(
    collection(db, "orders"),
    where("repairId", "==", repairRow.id),
    limit(1)
  );
  const snap = await getDocs(qy);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }
  return null;
}
async function ensureOrderForCustom(db, customRow) {
  if (!customRow?.id) return null;
  if (customRow.orderId) {
    const s = await getDoc(doc(db, "orders", customRow.orderId));
    if (s.exists()) return { id: s.id, ...s.data() };
  }
  const qy = query(
    collection(db, "orders"),
    where("origin", "==", "customization"),
    limit(20)
  );
  const snap = await getDocs(qy);
  let linked = null;
  snap.forEach((d) => {
    const o = { id: d.id, ...d.data() };
    if (
      o.customId === customRow.id ||
      o.linkedCustomId === customRow.id ||
      o?.metadata?.customId === customRow.id
    ) {
      linked = o;
    }
  });
  return linked;
}  
function latestAdditionalCents(row) {
  const fromField = N(row?.lastAdditionalPaymentCents);
  if (fromField > 0) return fromField;

  const fromRequested = N(row?.requestedAdditionalPaymentCents);
  if (fromRequested > 0) return fromRequested;

  const arr = Array.isArray(row?.additionalPaymentProofs)
    ? row.additionalPaymentProofs
    : [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const c = N(arr[i]?.amountCents);
    if (c > 0) return c;
  }
  return 0;
}
function applySettlement(row, basePatch, desiredStatus) {
  const merged = { ...row, ...basePatch };
  const m = computeMonies(merged);
  const patch = { ...basePatch };
  if (desiredStatus === "paid") {
    if (m.assessed !== m.netPaid) patch.assessedTotalCents = m.netPaid;
    patch.paymentStatus = "paid";
    patch.paidAt = serverTimestamp();
    patch.requestedAdditionalPaymentCents = 0;
    return patch;
  }
  if (m.balance > 0) {
    patch.paymentStatus = "awaiting_additional_payment";
    patch.requestedAdditionalPaymentCents = m.balance;
    patch.requestedAt = serverTimestamp();
  } else {
    patch.paymentStatus =
      desiredStatus === "refunded" ? "refunded" : "paid";
    if (patch.paymentStatus === "paid") patch.paidAt = serverTimestamp();
    if (patch.paymentStatus === "refunded")
      patch.refundedAt = serverTimestamp();
    patch.requestedAdditionalPaymentCents = 0;
  }
  return patch;
}
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
function CustomerBlock({ row, title = "Customer" }) {
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
  const line1 =
    addr?.line1 ??
    addr?.address1 ??
    row?.line1 ??
    row?.address1 ??
    "";
  const line2 =
    addr?.line2 ??
    addr?.address2 ??
    row?.line2 ??
    row?.address2 ??
    "";
  const city =
    addr?.city ??
    row?.city ??
    row?.shippingCity ??
    row?.customer?.city ??
    row?.customerInfo?.city ??
    "";
  const province =
    addr?.province ??
    addr?.state ??
    row?.province ??
    row?.state ??
    row?.shippingProvince ??
    "";
  const zip =
    addr?.zip ??
    addr?.postalCode ??
    addr?.postcode ??
    row?.zip ??
    row?.postalCode ??
    row?.postcode ??
    "";
  const country =
    addr?.country ??
    addr?.countryCode ??
    row?.country ??
    row?.shippingCountry ??
    row?.countryCode ??
    "";
  const uid =
    row?.userId ??
    row?.uid ??
    row?.customer?.uid ??
    row?.customerInfo?.uid ??
    "";
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
        <div>
          {[line1, line2].filter(Boolean).join(", ") || "—"}
        </div>
        <div className="kv">
          <label style={{ fontWeight: 600 }}>
            City / Province / ZIP
          </label>
        </div>
        <div>
          {[city, province, zip].filter(Boolean).join(" · ") || "—"}
        </div>
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
function AssessmentPanel({ kind, row }) {
  const [assessed, setAssessed] = useState(
    row?.assessedTotalCents != null
      ? Math.round(Number(row.assessedTotalCents) / 100)
      : ""
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
          <button
            className="save-btn"
            type="button"
            onClick={setToBalance}
          >
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
        <b>₱{(adds / 100).toLocaleString()}</b> · Refunds:{" "}
        <b>₱{(refs / 100).toLocaleString()}</b> · Computed Balance:{" "}
        <b>₱{(balance / 100).toLocaleString()}</b>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          className="save-btn"
          onClick={async () => {
            const assessedCents = Math.max(
              0,
              Math.round(Number(assessed || 0) * 100)
            );
            const requestCentsInput =
              amountPHP === ""
                ? null
                : Math.max(
                    0,
                    Math.round(Number(amountPHP || 0) * 100)
                  );
            try {
              await upsertAssessmentAndRequest({
                kind,
                id: row.id,
                assessedTotalCents: assessedCents,
                requestAmountCents: requestCentsInput,
                note,
              });
              alert("Assessment saved and request sent.");
              return;
            } catch (e) {
              if (
                !/linked order not found/i.test(
                  String(e?.message || "")
                )
              ) {
                alert(e?.message || "Failed to save assessment.");
                return;
              }
              try {
                const db = getFirestore(auth.app);
                const dep = Number(row?.depositCents || 0);
                const adds = Number(
                  row?.additionalPaymentsCents || 0
                );
                const refs = Number(row?.refundsCents || 0);
                const computedBalance = Math.max(
                  0,
                  assessedCents - (dep + adds - refs)
                );
                const requestCents =
                  requestCentsInput == null
                    ? computedBalance
                    : requestCentsInput;
                const coll =
                  kind === "repair" ? "repairs" : "custom_orders";
                await updateDoc(doc(db, coll, row.id), {
                  assessedTotalCents: assessedCents,
                  requestedAdditionalPaymentCents: requestCents,
                  assessmentNotes: note || "",
                  assessedAt: serverTimestamp(),
                  requestedAt: serverTimestamp(),
                  paymentStatus:
                    requestCents > 0
                      ? "awaiting_additional_payment"
                      : "paid",
                });
                const uid =
                  row?.userId ??
                  row?.uid ??
                  row?.customer?.uid ??
                  row?.customerInfo?.uid ??
                  null;
                if (uid) {
                  await addDoc(
                    collection(db, "users", uid, "notifications"),
                    {
                      type: "additional_payment_request",
                      ...(kind === "repair"
                        ? { repairId: row.id }
                        : { customId: row.id }),
                      title: "Additional payment requested",
                      body: `Please pay ₱${Math.round(
                        requestCents / 100
                      ).toLocaleString()} to proceed.`,
                      createdAt: serverTimestamp(),
                      read: false,
                    }
                  );
                }
                alert(
                  "Assessment saved and request sent (no linked order)."
                );
              } catch (e2) {
                alert(e2?.message || "Fallback save failed.");
              }
            }
          }}
        >
          Save & Send Request
        </button>
      </div>

      {(row?.lastAdditionalPaymentProofUrl ||
        row?.lastAdditionalPaymentProofPath) && (
        <div className="span-2" style={{ marginTop: 12 }}>
          <h4>Latest Additional Payment Proof</h4>
          <ResolvedImg
            pathOrUrl={
              row.lastAdditionalPaymentProofUrl ||
              row.lastAdditionalPaymentProofPath
            }
            alt="Additional Payment Proof"
            size={200}
          />
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const db = useMemo(() => getFirestore(auth.app), []);
  const [activeTab, setActiveTab] = useState("orders");

  
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState({});
  const [draft, setDraft] = useState({});
  const [deleting, setDeleting] = useState({});
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  
  const [repairs, setRepairs] = useState([]);
  const [repairsLoading, setRepairsLoading] = useState(true);
  const [repairsErr, setRepairsErr] = useState("");
  const [repairsFilter, setRepairsFilter] = useState("all");
  const [repairsSaving, setRepairsSaving] = useState({});
  const [repairsDraft, setRepairsDraft] = useState({});
  const [repDeleting, setRepDeleting] = useState({});
  const [expandedRepairId, setExpandedRepairId] = useState(null);

  
  const [customs, setCustoms] = useState([]);
  const [customsLoading, setCustomsLoading] = useState(true);
  const [customsErr, setCustomsErr] = useState("");
  const [customsFilter, setCustomsFilter] = useState("all");
  const [customsSaving, setCustomsSaving] = useState({});
  const [customsDraft, setCustomsDraft] = useState({});
  const [customDeleting, setCustomDeleting] = useState({});
  const [expandedCustomId, setExpandedCustomId] = useState(null);

 
  useEffect(() => {
    const qy = query(collection(db, "orders"));
    const stop = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        setErr(e?.message || "Failed to load orders.");
        setLoading(false);
      }
    );
    return stop;
  }, [db]);

  useEffect(() => {
    const qy = query(collection(db, "repairs"));
    const stop = onSnapshot(
      qy,
      (snap) => {
        setRepairs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setRepairsLoading(false);
      },
      (e) => {
        setRepairsErr(e?.message || "Failed to load repair orders.");
        setRepairsLoading(false);
      }
    );
    return stop;
  }, [db]);

  useEffect(() => {
    const qy = query(collection(db, "custom_orders"));
    const stop = onSnapshot(
      qy,
      (snap) => {
        setCustoms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCustomsLoading(false);
      },
      (e) => {
        setCustomsErr(
          e?.message || "Failed to load customization orders."
        );
        setCustomsLoading(false);
      }
    );
    return stop;
  }, [db]);

 
  const productOrders = useMemo(
    () =>
      rows.filter(
        (o) =>
          !o?.repairId &&
          String(o?.origin || "catalog") !== "customization"
      ),
    [rows]
  );

  const ordered = useMemo(() => {
    const sorted = [...productOrders].sort(
      (a, b) =>
        tsToMillis(pickDate(b)) - tsToMillis(pickDate(a))
    );
    if (filter === "all") return sorted;
    return sorted.filter(
      (o) => (o?.status || "processing") === filter
    );
  }, [productOrders, filter]);

  const repairsOrdered = useMemo(() => {
    const sorted = [...repairs].sort(
      (a, b) =>
        tsToMillis(pickDate(b)) - tsToMillis(pickDate(a))
    );
    if (repairsFilter === "all") return sorted;
    return sorted.filter(
      (r) => (r?.status || "processing") === repairsFilter
    );
  }, [repairs, repairsFilter]);

  const customsOrdered = useMemo(() => {
    const sorted = [...customs].sort(
      (a, b) =>
        tsToMillis(pickDate(b)) - tsToMillis(pickDate(a))
    );
    if (customsFilter === "all") return sorted;
    return sorted.filter(
      (c) => (c?.status || "draft") === customsFilter
    );
  }, [customs, customsFilter]);

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
  async function mirrorPatchToLinkedDocsFromOrder(orderRow, patch) {
    const db2 = getFirestore(auth.app);
    if (orderRow?.repairId) {
      try {
        await updateDoc(doc(db2, "repairs", orderRow.repairId), patch);
        setRepairs((prev) =>
          prev.map((r) =>
            r.id === orderRow.repairId ? { ...r, ...patch } : r
          )
        );
      } catch (e) {
        console.warn("Mirror to repairs failed:", e?.message || e);
      }
    }
    if (String(orderRow?.origin || "") === "customization") {
      try {
        const qy = query(
          collection(db2, "custom_orders"),
          where("orderId", "==", orderRow.id),
          limit(5)
        );
        const snap = await getDocs(qy);
        if (!snap.empty) {
          const ids = [];
          const ops = [];
          snap.forEach((d) => {
            ids.push(d.id);
            ops.push(updateDoc(d.ref, patch));
          });
          await Promise.all(ops);
          setCustoms((prev) =>
            prev.map((c) =>
              ids.includes(c.id) ? { ...c, ...patch } : c
            )
          );
        }
      } catch (e) {
        console.warn("Mirror to custom_orders failed:", e?.message || e);
      }
    }
  }   
  async function requestRemainingBalanceForOrder(orderRow) {
    const db2 = getFirestore(auth.app);
    const m = computeMonies(orderRow);
    if (m.balance <= 0) {
      alert("No remaining balance to request.");
      return;
    }
    const patch = {
      assessedTotalCents: assessedCentsFrom(orderRow),
      requestedAdditionalPaymentCents: m.balance,
      paymentStatus: "awaiting_additional_payment",
      requestedAt: serverTimestamp(),
      paymentUpdatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db2, "orders", orderRow.id), patch);
    setRows((prev) =>
      prev.map((o) =>
        o.id === orderRow.id ? { ...o, ...patch } : o
      )
    );
    await mirrorPatchToLinkedDocsFromOrder(orderRow, patch);
    const uid = orderRow?.userId;
    if (uid) {
      await addDoc(
        collection(db2, "users", uid, "notifications"),
        {
          type: "additional_payment_request",
          orderId: orderRow.id,
          title: "Additional payment requested",
          body: `Please pay ₱${Math.round(
            m.balance / 100
          ).toLocaleString()} to complete your order.`,
          createdAt: serverTimestamp(),
          read: false,
        }
      );
    }
    alert(
      `Requested ₱${Math.round(
        m.balance / 100
      ).toLocaleString()} remaining balance.`
    );
  }
  async function requestRemainingBalanceForRepair(repairRow) {
    const db2 = getFirestore(auth.app);
    const linkedOrder =
      rows.find((o) => o?.repairId === repairRow.id) || null;
    if (linkedOrder)
      return requestRemainingBalanceForOrder(linkedOrder);

    const m = computeMonies(repairRow);
    if (m.balance <= 0) {
      alert("No remaining balance to request.");
      return;
    }
    const patch = {
      assessedTotalCents: assessedCentsFrom(repairRow),
      requestedAdditionalPaymentCents: m.balance,
      paymentStatus: "awaiting_additional_payment",
      requestedAt: serverTimestamp(),
      paymentUpdatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db2, "repairs", repairRow.id), patch);
    setRepairs((prev) =>
      prev.map((r) =>
        r.id === repairRow.id ? { ...r, ...patch } : r
      )
    );
    const uid =
      repairRow?.userId ??
      repairRow?.uid ??
      repairRow?.customer?.uid ??
      null;
    if (uid) {
      await addDoc(
        collection(db2, "users", uid, "notifications"),
        {
          type: "additional_payment_request",
          repairId: repairRow.id,
          title: "Additional payment requested",
          body: `Please pay ₱${Math.round(
            m.balance / 100
          ).toLocaleString()} to proceed with your repair.`,
          createdAt: serverTimestamp(),
          read: false,
        }
      );
    }
    alert(
      `Requested ₱${Math.round(
        m.balance / 100
      ).toLocaleString()} remaining balance.`
    );
  }
  async function requestRemainingBalanceForCustom(customRow) {
    const db2 = getFirestore(auth.app);
    const linkedOrder =
      rows.find(
        (o) =>
          String(o?.origin || "") === "customization" &&
          (o?.customId === customRow.id ||
            o?.linkedCustomId === customRow.id ||
            o?.metadata?.customId === customRow.id)
      ) || null;

    if (linkedOrder)
      return requestRemainingBalanceForOrder(linkedOrder);

    const m = computeMonies(customRow);
    if (m.balance <= 0) {
      alert("No remaining balance to request.");
      return;
    }
    const patch = {
      assessedTotalCents: assessedCentsFrom(customRow),
      requestedAdditionalPaymentCents: m.balance,
      paymentStatus: "awaiting_additional_payment",
      requestedAt: serverTimestamp(),
      paymentUpdatedAt: serverTimestamp(),
    };
    await updateDoc(
      doc(db2, "custom_orders", customRow.id),
      patch
    );
    setCustoms((prev) =>
      prev.map((c) =>
        c.id === customRow.id ? { ...c, ...patch } : c
      )
    );
    const uid =
      customRow?.userId ??
      customRow?.uid ??
      customRow?.customer?.uid ??
      null;
    if (uid) {
      await addDoc(
        collection(db2, "users", uid, "notifications"),
        {
          type: "additional_payment_request",
          customId: customRow.id,
          title: "Additional payment requested",
          body: `Please pay ₱${Math.round(
            m.balance / 100
          ).toLocaleString()} to continue your customization.`,
          createdAt: serverTimestamp(),
          read: false,
        }
      );
    }
    alert(
      `Requested ₱${Math.round(
        m.balance / 100
      ).toLocaleString()} remaining balance.`
    );
  }
  async function updatePaymentForCustomization(customRow, nextStatus) {
  const db2 = getFirestore(auth.app);
  const linkedOrder = await ensureOrderForCustom(db2, customRow);
  if (!linkedOrder) {
    await updateCustomPayment(customRow.id, nextStatus);
    return;
  }
  await updateOrderPayment(linkedOrder.id, linkedOrder, nextStatus);
  let freshOrder = linkedOrder;
  try {
    const s = await getDoc(doc(db2, "orders", linkedOrder.id));
    if (s.exists()) freshOrder = { id: s.id, ...s.data() };
  } catch {}
  const patch = {
    paymentStatus: String(nextStatus || "").toLowerCase(),
    paymentUpdatedAt: serverTimestamp(),
    depositCents: freshOrder?.depositCents ?? null,
    additionalPaymentsCents: freshOrder?.additionalPaymentsCents ?? null,
    refundsCents: freshOrder?.refundsCents ?? null,
    assessedTotalCents: freshOrder?.assessedTotalCents ?? null,
    requestedAdditionalPaymentCents:
      freshOrder?.requestedAdditionalPaymentCents ?? 0,
    paymentProofPendingReview: !!freshOrder?.paymentProofPendingReview,
  };
  await updateDoc(doc(db2, "custom_orders", customRow.id), patch);
  setCustoms((prev) =>
    prev.map((c) => (c.id === customRow.id ? { ...c, ...patch } : c))
  );
  setRows((prev) =>
    prev.map((o) =>
      o.id === freshOrder.id ? { ...o, paymentStatus: patch.paymentStatus } : o
    )
  );
}
  async function updateOrderPayment(orderId, currentRow, nextStatus) {
    const db2 = getFirestore(auth.app);
    const val = String(nextStatus || "").toLowerCase();
    let patch = { paymentUpdatedAt: serverTimestamp() };
    if (val === "deposit_paid") {
      const defaultPHP = Math.round(
        Number(
          currentRow?.assessedTotalCents != null
            ? currentRow.assessedTotalCents / 100
            : currentRow?.total != null
            ? currentRow.total
            : Number(currentRow?.unitPrice || 0) +
              Number(currentRow?.shippingFee || 0)
        )
      );
      const ans = prompt(
        `Enter initial payment amount (₱).`,
        String(defaultPHP || "")
      );
      if (ans !== null && ans !== "") {
        const pesos = Math.max(
          0,
          Math.round(Number(ans || 0))
        );
        patch.depositCents = pesos * 100;
        patch.deposit = pesos;
      }
      patch = applySettlement(
        currentRow,
        patch,
        "deposit_paid"
      );
    } else if (val === "paid") {
      const latestC = latestAdditionalCents(currentRow);
      if (latestC > 0) {
        patch.additionalPaymentsCents =
          N(currentRow?.additionalPaymentsCents) + latestC;
        patch.lastAdditionalPaymentCents = latestC;
        patch.requestedAdditionalPaymentCents = 0;
        patch.paymentProofPendingReview = false;
      }
      patch = applySettlement(
        { ...currentRow, ...patch },
        patch,
        "paid"
      );
    } else {
      patch.paymentStatus = val;
      if (val === "refunded")
        patch.refundedAt = serverTimestamp();
      if (val !== "awaiting_additional_payment") {
        patch.requestedAdditionalPaymentCents = Number(
          currentRow?.requestedAdditionalPaymentCents || 0
        );
      }
    }
    await updateDoc(doc(db2, "orders", orderId), patch);
    setRows((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, ...patch } : o
      )
    );
    await mirrorPatchToLinkedDocsFromOrder(
      { ...currentRow, id: orderId },
      patch
    );
  }
  async function updateRepairPayment(
    repairId,
    currentRow,
    nextStatus
  ) {
    const db2 = getFirestore(auth.app);
    const val = String(nextStatus || "").toLowerCase();
    let patch = { paymentUpdatedAt: serverTimestamp() };

    if (val === "deposit_paid") {
      const defaultPHP = Math.round(
        Number(
          currentRow?.assessedTotalCents != null
            ? currentRow.assessedTotalCents / 100
            : currentRow?.total || 0
        )
      );
      const ans = prompt(
        `Enter initial payment amount (₱).`,
        String(defaultPHP || "")
      );
      if (ans !== null && ans !== "") {
        const pesos = Math.max(
          0,
          Math.round(Number(ans || 0))
        );
        patch.depositCents = pesos * 100;
        patch.deposit = pesos;
      }
      patch = applySettlement(
        currentRow,
        patch,
        "deposit_paid"
      );
    } else if (val === "paid") {
      const latestC = latestAdditionalCents(currentRow);
      if (latestC > 0) {
        patch.additionalPaymentsCents =
          N(currentRow?.additionalPaymentsCents) + latestC;
        patch.lastAdditionalPaymentCents = latestC;
        patch.requestedAdditionalPaymentCents = 0;
        patch.paymentProofPendingReview = false;
      }
      patch = applySettlement(
        { ...currentRow, ...patch },
        patch,
        "paid"
      );
    } else {
      patch.paymentStatus = val;
      if (val === "refunded")
        patch.refundedAt = serverTimestamp();
      if (val !== "awaiting_additional_payment") {
        patch.requestedAdditionalPaymentCents = Number(
          currentRow?.requestedAdditionalPaymentCents || 0
        );
      }
    }
    await updateDoc(doc(db2, "repairs", repairId), patch);
    setRepairs((prev) =>
      prev.map((r) =>
        r.id === repairId ? { ...r, ...patch } : r
      )
    );
  }
  async function updateCustomPayment(customId, nextStatus) {
    const db2 = getFirestore(auth.app);
    const val = String(nextStatus || "").toLowerCase();
    const snap = await getDoc(
      doc(db2, "custom_orders", customId)
    );
    const currentRow = snap.exists()
      ? { id: snap.id, ...snap.data() }
      : {};
    let patch = { paymentUpdatedAt: serverTimestamp() };

    if (val === "deposit_paid") {
      const defaultPHP = Math.round(
        Number(
          currentRow?.assessedTotalCents != null
            ? currentRow.assessedTotalCents / 100
            : currentRow?.unitPrice || 0
        )
      );
      const ans = prompt(
        `Enter initial payment amount (₱).`,
        String(defaultPHP || "")
      );
      if (ans !== null && ans !== "") {
        const pesos = Math.max(
          0,
          Math.round(Number(ans || 0))
        );
        patch.depositCents = pesos * 100;
        patch.deposit = pesos;
      }
      patch = applySettlement(
        currentRow,
        patch,
        "deposit_paid"
      );
    } else if (val === "paid") {
      const latestC = latestAdditionalCents(currentRow);
      if (latestC > 0) {
        patch.additionalPaymentsCents =
          N(currentRow?.additionalPaymentsCents) + latestC;
        patch.lastAdditionalPaymentCents = latestC;
        patch.requestedAdditionalPaymentCents = 0;
        patch.paymentProofPendingReview = false;
      }
      patch = applySettlement(
        { ...currentRow, ...patch },
        patch,
        "paid"
      );
    } else {
      patch.paymentStatus = val;
      if (val === "refunded")
        patch.refundedAt = serverTimestamp();
      if (val !== "awaiting_additional_payment") {
        patch.requestedAdditionalPaymentCents = Number(
          currentRow?.requestedAdditionalPaymentCents || 0
        );
      }
    }
    await updateDoc(
      doc(db2, "custom_orders", customId),
      patch
    );
    setCustoms((prev) =>
      prev.map((c) =>
        c.id === customId ? { ...c, ...patch } : c
      )
    );
  }
  async function saveStatus(id) {
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
          await ensureShipmentForOrder({ ...orderRow, id, kind: "orders" });
        } catch {}
      }

      const uid = orderRow?.userId;
      if (uid) {
        const firstItem = Array.isArray(orderRow?.items)
          ? orderRow.items[0]
          : null;
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
  }
  async function saveRepairStatus(id) {
    const newStatus = repairsDraft[id];
    if (!newStatus) return;

    setRepairsSaving((p) => ({ ...p, [id]: true }));

    try {
      const db2 = getFirestore(auth.app);

      const updates = {
        status: newStatus,
        statusUpdatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db2, "repairs", id), updates);
      setRepairs((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
      );
      try {
        const rRow = repairs.find((x) => x.id === id) || {};
        let uid =
          rRow.userId ??
          rRow.uid ??
          rRow.customer?.uid ??
          rRow.customerInfo?.uid ??
          null;

      
        if (!uid) {
          const linkedOrder = rows.find((o) => o?.repairId === id) || null;
          if (linkedOrder?.userId) uid = linkedOrder.userId;
        }

        if (uid) {
          await addDoc(collection(db2, "users", uid, "notifications"), {
            type: "repair_status",
            repairId: id,
            status: newStatus,
            title: `Repair ${String(id).slice(0, 6)} status updated`,
            body: `Repair status is now ${
              STATUS_LABEL[newStatus] || newStatus
            }.`,
            link: `/ordersummary?repairId=${id}`,
            createdAt: serverTimestamp(),
            read: false,
          });
        }
      } catch (e) {
        console.warn("Failed to create repair status notification:", e);
      }

      
      if (newStatus === "to_ship") {
        const rRow = repairs.find((x) => x.id === id) || { id };
        try {
          await ensureShipmentForOrder({ ...rRow, id, kind: "repairs" });
        } catch (e) {
          console.warn(
            "ensureShipmentForOrder (repair) failed:",
            e?.message || e
          );
        }
      }
    } catch (e) {
      alert(e?.message || "Failed to update repair status.");
    } finally {
      setRepairsSaving((p) => ({ ...p, [id]: false }));
    }
  }

      
  async function saveCustomStatus(id) {
  const newStatus = customsDraft[id];
  if (!newStatus) return;

  setCustomsSaving((p) => ({ ...p, [id]: true }));

  try {
    const db2 = getFirestore(auth.app);

    const updates = {
      status: newStatus,
      statusUpdatedAt: serverTimestamp(),
    };

    
    await updateDoc(doc(db2, "custom_orders", id), updates);

    
    setCustoms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );

    
    try {
      const cRow = customs.find((x) => x.id === id) || {};
      
      let uid =
        cRow.userId ??
        cRow.uid ??
        cRow.customer?.uid ??
        cRow.customerInfo?.uid ??
        null;

      
      if (!uid) {
        const linkedOrder =
          rows.find(
            (o) =>
              String(o?.origin || "") === "customization" &&
              (o?.customId === id ||
                o?.linkedCustomId === id ||
                o?.metadata?.customId === id ||
                o?.id === cRow.orderId)
          ) || null;
        if (linkedOrder?.userId) uid = linkedOrder.userId;
      }

      if (uid) {
        await addDoc(collection(db2, "users", uid, "notifications"), {
          type: "custom_status",
          customId: id,
          status: newStatus,
          title: `Customization ${String(id).slice(0, 6)} status updated`,
          body: `Customization status is now ${
            STATUS_LABEL[newStatus] || newStatus
          }.`,
          link: `/ordersummary?customId=${id}`,
          createdAt: serverTimestamp(),
          read: false,
        });
      }
    } catch (e) {
      console.warn("Failed to create customization status notification:", e);
    }

    
    if (newStatus === "to_ship") {
      const cRow = customs.find((x) => x.id === id) || { id };

      try {
        await ensureShipmentForOrder({
          ...cRow,
          ...updates,
          id,
          kind: "custom_orders",
        });
      } catch (e) {
        console.warn("ensureShipmentForOrder (custom) failed:", e?.message || e);
      }
    }
  } catch (e) {
    alert(e?.message || "Failed to update customization status.");
  } finally {
    setCustomsSaving((p) => ({ ...p, [id]: false }));
  }
}
  
async function deleteOrderCascade(id) {
  try {
    setDeleting((p) => ({ ...p, [id]: true }));
    const db2 = getFirestore(auth.app);

    
    const row = rows.find((o) => o.id === id) || {};
    const userId =
      row.userId ??
      row.uid ??
      row.customer?.uid ??
      row.customerInfo?.uid ??
      null;

    
    await deleteShipmentsForOrder(id).catch(() => {});

    
    if (userId) {
      try {
        await deleteNotificationsForOrder(db2, {
          userId,
          sourceId: id,
          kind: "orders",
        });
      } catch (e) {
        console.warn("Failed to delete order notifications:", e);
      }
    }

    
    await deleteDoc(doc(db2, "orders", id));

    
    setRows((prev) => prev.filter((o) => o.id !== id));
  } catch (e) {
    alert(e?.message || "Failed to delete order.");
  } finally {
    setDeleting((p) => ({ ...p, [id]: false }));
  }
}


  
  async function deleteRepairCascade(id) {
    try {
      setRepDeleting((p) => ({ ...p, [id]: true }));
      const db2 = getFirestore(auth.app);

      
      const rRow = repairs.find((x) => x.id === id) || {};
      const userId =
        rRow.userId ??
        rRow.uid ??
        rRow.customer?.uid ??
        rRow.customerInfo?.uid ??
        null;

      
      const linked =
        rows.find((o) => o?.repairId === id) || null;
      if (linked) {
        
        await deleteOrderCascade(linked.id);
      }

      
      await deleteShipmentsForOrder(id).catch(() => {});

      
      if (userId) {
        try {
          await deleteNotificationsForOrder(db2, {
            userId,
            sourceId: id,
            kind: "repairs",
          });
        } catch (e) {
          console.warn("Failed to delete repair notifications:", e);
        }
      }

      
      await deleteDoc(doc(db2, "repairs", id));

      
      setRepairs((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert(e?.message || "Failed to delete repair.");
    } finally {
      setRepDeleting((p) => ({ ...p, [id]: false }));
    }
  }

  
  async function deleteCustomCascade(id) {
    try {
      setCustomDeleting((p) => ({ ...p, [id]: true }));
      const db2 = getFirestore(auth.app);

      
      const cRow = customs.find((x) => x.id === id) || {};
      const userId =
        cRow.userId ??
        cRow.uid ??
        cRow.customer?.uid ??
        cRow.customerInfo?.uid ??
        null;

      
      const linked =
        rows.find(
          (o) =>
            String(o?.origin || "") === "customization" &&
            (o?.customId === id ||
              o?.linkedCustomId === id ||
              o?.metadata?.customId === id ||
              o?.id === cRow.orderId)
        ) || null;

      if (linked) {
        
        await deleteOrderCascade(linked.id);
      }

      
      await deleteShipmentsForOrder(id).catch(() => {});

      
      if (userId) {
        try {
          await deleteNotificationsForOrder(db2, {
            userId,
            sourceId: id,
            kind: "custom_orders",
          });
        } catch (e) {
          console.warn("Failed to delete custom notifications:", e);
        }
      }

      
      await deleteDoc(doc(db2, "custom_orders", id));

      
      setCustoms((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      alert(e?.message || "Failed to delete customization.");
    } finally {
      setCustomDeleting((p) => ({ ...p, [id]: false }));
    }
  }



  
async function deleteNotificationsForOrder(db, { userId, sourceId, kind }) {
  
  if (!db || !userId || !sourceId) return;

  const field =
    kind === "repairs"
      ? "repairId"
      : kind === "custom_orders"
      ? "customId"
      : "orderId";

  const notifCol = collection(db, "users", userId, "notifications");
  const qy = query(notifCol, where(field, "==", sourceId));

  const snap = await getDocs(qy);
  if (snap.empty) return;

  const batch = writeBatch(db);
  snap.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
}


  

 
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
      onClick={() => onClick()}
      style={{ background: open ? "#6b7e76" : "#2c5f4a" }}
      title={open ? "Hide details" : "View details"}
    >
      {open ? "Hide" : "View"}
    </button>
  );
 
  return (
    <div className="admin-orders">
      <div
        className="orders-topbar"
        style={{ marginBottom: 16, justifyContent: "space-between" }}
      >
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

      {/* -------------------- ORDERS TAB -------------------- */}
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
                        {productOrders.filter(
                          (o) => (o?.status || "processing") === btn.key
                        ).length}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          </div>

          {err && <p className="err">{err}</p>}
          {loading && <p className="muted">Loading…</p>}
          {!loading && ordered.length === 0 && (
            <p className="muted">No orders found.</p>
          )}

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
                      [o?.shippingAddress?.firstName, o?.shippingAddress?.lastName]
                        .filter(Boolean)
                        .join(" ") ||
                      o?.contactEmail ||
                      "—";
                    const itemsCount = Array.isArray(o?.items)
                      ? o.items.reduce(
                          (sum, it) => sum + (Number(it?.qty) || 1),
                          0
                        )
                      : 0;
                    const m = computeMonies(o);
                    const totalDisplay = fmtPHP(m.displayTotalPHP);
                    const status = String(o?.status || "processing");
                    const draftStatus = draft[id] ?? status;
                    const pay = String(o?.paymentStatus || "pending");
                    const isOpen = expandedOrderId === id;

                    const additionalProofs = Array.isArray(
                      o?.additionalPaymentProofs
                    )
                      ? o.additionalPaymentProofs
                      : [];
                    const depositProof =
                      o?.depositPaymentProofUrl ||
                      o?.paymentProofUrl ||
                      o?.paymentProofPath ||
                      null;
                    const latestAdditional =
                      o?.lastAdditionalPaymentProofUrl ||
                      o?.lastAdditionalPaymentProofPath ||
                      null;

                    return (
                      <React.Fragment key={id}>
                        <tr>
                          <td className="mono">{id}</td>
                          <td>{when}</td>
                          <td title={name}>{name}</td>
                          <td>{itemsCount}</td>
                          <td className="mono strong">{totalDisplay}</td>
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
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [id]: e.target.value,
                                }))
                              }
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option
                                  key={opt.value}
                                  value={opt.value}
                                  
                                  disabled={SHIPPING_DRIVEN_STATUSES.has(
                                    opt.value
                                  )}
                                >
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              className="save-btn"
                              onClick={() => saveStatus(id)}
                              disabled={
                                saving[id] || draftStatus === status
                              }
                              type="button"
                              title={
                                draftStatus === status ? "No changes" : "Save"
                              }
                            >
                              {saving[id] ? "Saving…" : "Save"}
                            </button>
                            <IconTrashBtn
                              color={clrOrders}
                              disabled={!!deleting[id]}
                              title="Delete order"
                              onClick={() => {
                                if (
                                  confirm(
                                    "Delete this order? This cannot be undone."
                                  )
                                ) {
                                  deleteOrderCascade(id);
                                }
                              }}
                            />
                          </td>
                          <td>
                            <ViewButton
                              rowId={id}
                              open={isOpen}
                              onClick={() =>
                                setExpandedOrderId(
                                  isOpen ? null : id
                                )
                              }
                            />
                          </td>
                        </tr>
                        {/* ----- expanded details row ----- */}
                        {isOpen && (
                          <tr>
                            <td colSpan={8}>
                              <div className="details-grid">
                                {/* Deposit proof */}
                                {depositProof && (
                                  <div className="span-2">
                                    <h4>Initial Payment Proof</h4>
                                    <ResolvedImg
                                      pathOrUrl={depositProof}
                                      alt="Initial Payment Proof"
                                      size={200}
                                    />
                                  </div>
                                )}

                                {/* Additional proofs (array + latest) */}
                                {(additionalProofs.length > 0 ||
                                  latestAdditional) && (
                                  <div className="span-2">
                                    <h4>Additional Payment Proofs</h4>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {additionalProofs.map((p, i) => (
                                        <ResolvedImg
                                          key={i}
                                          pathOrUrl={p?.url || p}
                                          alt={`Additional ${i + 1}`}
                                          size={120}
                                        />
                                      ))}
                                      {latestAdditional && (
                                        <ResolvedImg
                                          pathOrUrl={latestAdditional}
                                          alt="Latest Additional"
                                          size={120}
                                        />
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div className="span-2">
                                  <h4>Payment Status</h4>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <select
                                      className="status-select"
                                      value={o.paymentStatus || "pending"}
                                      onChange={(e) =>
                                        updateOrderPayment(
                                          o.id,
                                          o,
                                          e.target.value
                                        )
                                      }
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="deposit_paid">
                                        Deposit_Paid
                                      </option>
                                      <option value="awaiting_additional_payment">
                                        Awaiting_Additional_Payment
                                      </option>
                                      <option value="paid">Paid</option>
                                      <option value="refunded">Refunded</option>
                                      <option value="rejected">Rejected</option>
                                    </select>

                                    {m.balance > 0 && (
                                      <button
                                        className="save-btn"
                                        type="button"
                                        style={{ background: "#111827" }}
                                        onClick={() =>
                                          requestRemainingBalanceForOrder(o)
                                        }
                                        title="Ask customer to pay the remaining balance"
                                      >
                                        Request: Pay Remaining Balance (₱
                                        {Math.round(
                                          m.balance / 100
                                        ).toLocaleString()}
                                        )
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div>
                                  <div className="kv">
                                    <label>Status</label>
                                    <div>
                                      <span
                                        className={`badge status-${status}`}
                                      >
                                        {(
                                          STATUS_LABEL[status] || status
                                        ).toUpperCase()}
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
                                      {totalDisplay}
                                    </div>
                                  </div>
                                  {o?.shippingFee != null && (
                                    <div className="kv">
                                      <label>Shipping Fee</label>
                                      <div className="mono">
                                        {fmtPHP(o.shippingFee)}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Order total breakdown */}
                                <div>
                                  <h4>Order Total</h4>
                                  <div className="kv">
                                    <label>Unit Price</label>
                                    <div className="mono">
                                      {fmtPHP(m.unitPHP)}
                                    </div>
                                  </div>
                                  <div className="kv">
                                    <label>Shipping</label>
                                    <div className="mono">
                                      {fmtPHP(m.shipPHP)}
                                    </div>
                                  </div>
                                  <div className="kv">
                                    <label>Total</label>
                                    <div className="mono strong">
                                      {fmtPHP(m.displayTotalPHP)}
                                    </div>
                                  </div>
                                  <div className="kv">
                                    <label>Net Paid</label>
                                    <div className="mono strong">
                                      {fmtPHP(
                                        Math.round(
                                          (m.dep + m.adds - m.refs) / 100
                                        )
                                      )}
                                    </div>
                                  </div>
                                  <div className="kv">
                                    <label>Balance Due</label>
                                    <div
                                      className="mono"
                                      style={{
                                        fontWeight: 700,
                                        color:
                                          m.balance > 0
                                            ? "#b91c1c"
                                            : "#1f2937",
                                      }}
                                    >
                                      {fmtPHP(
                                        Math.round(m.balance / 100)
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <CustomerBlock
                                  title="Customer"
                                  row={o}
                                />

                                <div className="span-2">
  <h4>Items</h4>
  <ul className="items">
    {(o?.items || []).map((it, i) => {
      const size =
        it?.size ||
        it?.selectedSize ||
        it?.sizeLabel ||
        it?.selectedSizeLabel ||
        null;
      const color =
        it?.color ||
        it?.selectedColor ||
        it?.colorLabel ||
        null;
      const material =
        it?.material ||
        it?.selectedMaterial ||
        it?.materialLabel ||
        null;

      const variantParts = [
        size,
        color,
        material,
      ].filter(Boolean);

      // mobile items may store additionals on the item too
      const additionalsText =
        fmtAdditionals(it?.additionals) || "";

      return (
        <li key={i} className="item">
          <div className="item-title">
            {it?.title || it?.name || "Item"}
          </div>

          <div className="muted">
            {variantParts.length > 0 && (
              <>
                {variantParts.join(" • ")}
                {" · "}
              </>
            )}
            Qty: {it?.qty ?? 1}
          </div>

          {additionalsText && (
            <div className="muted">
              Additionals: {additionalsText}
            </div>
          )}

          <div className="mono">
            {fmtPHP(it?.price)}
          </div>
        </li>
      );
    })}
  </ul>
</div>


                                {o?.note && (
                                  <div className="span-2">
                                    <h4>Note</h4>
                                    <pre className="note">
                                      {o.note}
                                    </pre>
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

      {/* -------------------- REPAIRS TAB -------------------- */}
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
                    const when = fmtDate(pickDate(r));
                    const name = r?.contactEmail || r?.userId || "—";
                    const total =
                      Number(
                        r?.total ??
                          (r?.typePrice || 0) +
                            (r?.coverMaterialPrice || 0) +
                            (r?.frameMaterialPrice || 0)
                      ) || 0;
                    const status = String(r?.status || "processing");
                    const draftStatus = repairsDraft[id] ?? status;
                    const isOpen = expandedRepairId === id;

                    const linkedOrder = rows.find((o) => o?.repairId === id) || null;
                    const mLinked = linkedOrder ? computeMonies(linkedOrder) : null;

                    const depositProof =
                      r?.depositPaymentProofUrl ||
                      r?.paymentProofUrl ||
                      r?.paymentProofPath ||
                      null;
                    const additionalProofs = Array.isArray(r?.additionalPaymentProofs)
                      ? r.additionalPaymentProofs
                      : [];
                    const latestAdditional =
                      r?.lastAdditionalPaymentProofUrl ||
                      r?.lastAdditionalPaymentProofPath ||
                      null;

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
                                      style={{
                                        width: 40,
                                        height: 40,
                                        objectFit: "cover",
                                        borderRadius: 6,
                                      }}
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
                          <td className="mono strong">{fmtPHP(linkedOrder?.total ?? total)}</td>
                          <td>
                            <span className={`badge status-${status}`}>
                              {(STATUS_LABEL[status] || status).toUpperCase()}
                            </span>
                            <div style={{ marginTop: 4 }}>
                              <span
                                className={paymentBadgeClass(
                                  linkedOrder?.paymentStatus || r?.paymentStatus
                                )}
                              >
                                {String(
                                  linkedOrder?.paymentStatus ||
                                    r?.paymentStatus ||
                                    "pending"
                                ).toUpperCase()}
                              </span>
                            </div>
                          </td>
                          <td className="nowrap">
                            <select
                              className="status-select"
                              value={draftStatus}
                              onChange={(e) =>
                                setRepairsDraft((p) => ({
                                  ...p,
                                  [id]: e.target.value,
                                }))
                              }
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option
                                  key={opt.value}
                                  value={opt.value}
                                  
                                  disabled={SHIPPING_DRIVEN_STATUSES.has(
                                    opt.value
                                  )}
                                >
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
                                if (
                                  confirm(
                                    "Delete this repair (and any linked order)? This cannot be undone."
                                  )
                                ) {
                                  deleteRepairCascade(id);
                                }
                              }}
                            />
                          </td>
                          <td>
                            <ViewButton
                              rowId={id}
                              open={isOpen}
                              onClick={() =>
                                setExpandedRepairId(
                                  isOpen ? null : id
                                )
                              }
                            />
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={11}>
                              <div className="details-grid">
                                {/* Deposit proof */}
                                {depositProof && (
                                  <div className="span-2">
                                    <h4>Initial Payment Proof</h4>
                                    <ResolvedImg
                                      pathOrUrl={depositProof}
                                      alt="Initial Payment Proof"
                                      size={200}
                                    />
                                  </div>
                                )}

                                {/* Additional proofs */}
                                {(additionalProofs.length > 0 || latestAdditional) && (
                                  <div className="span-2">
                                    <h4>Additional Payment Proofs</h4>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {additionalProofs.map((p, i) => (
                                        <ResolvedImg
                                          key={i}
                                          pathOrUrl={p?.url || p}
                                          alt={`Additional ${i + 1}`}
                                          size={120}
                                        />
                                      ))}
                                      {latestAdditional && (
                                        <ResolvedImg
                                          pathOrUrl={latestAdditional}
                                          alt="Latest Additional"
                                          size={120}
                                        />
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div className="span-2">
                                  <h4>Payment Status</h4>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <select
                                      className="status-select"
                                      value={
                                        linkedOrder?.paymentStatus ||
                                        r?.paymentStatus ||
                                        "pending"
                                      }
                                      onChange={(e) =>
                                        linkedOrder
                                          ? updateOrderPayment(
                                              linkedOrder.id,
                                              linkedOrder,
                                              e.target.value
                                            )
                                          : updateRepairPayment(
                                              id,
                                              r,
                                              e.target.value
                                            )
                                      }
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="deposit_paid">
                                        Deposit_Paid
                                      </option>
                                      <option value="awaiting_additional_payment">
                                        Awaiting_Additional_Payment
                                      </option>
                                      <option value="paid">Paid</option>
                                      <option value="refunded">Refunded</option>
                                      <option value="rejected">Rejected</option>
                                    </select>

                                    {(() => {
                                      const target = linkedOrder || r;
                                      const money = linkedOrder
                                        ? mLinked
                                        : computeMonies(target);
                                      return money?.balance > 0 ? (
                                        <button
                                          className="save-btn"
                                          type="button"
                                          style={{ background: "#111827" }}
                                          onClick={() =>
                                            linkedOrder
                                              ? requestRemainingBalanceForOrder(
                                                  linkedOrder
                                                )
                                              : requestRemainingBalanceForRepair(
                                                  r
                                                )
                                          }
                                          title="Ask customer to pay the remaining balance"
                                        >
                                          Request: Pay Remaining Balance (₱
                                          {Math.round(
                                            money.balance / 100
                                          ).toLocaleString()}
                                          )
                                        </button>
                                      ) : null;
                                    })()}
                                  </div>
                                </div>

                                {/* Order total (linked order if exists, otherwise this repair doc) */}
{(() => {
  const target = linkedOrder || r;
  const money = linkedOrder ? mLinked : computeMonies(target);
  if (!money) return null;

  return (
    <div>
      <h4>Order Total</h4>
      <div className="kv">
        <label>Unit Price</label>
        <div className="mono">
          {fmtPHP(money.unitPHP)}
        </div>
      </div>
      <div className="kv">
        <label>Shipping</label>
        <div className="mono">
          {fmtPHP(money.shipPHP)}
        </div>
      </div>
      <div className="kv">
        <label>Total</label>
        <div className="mono strong">
          {fmtPHP(money.displayTotalPHP)}
        </div>
      </div>
      <div className="kv">
        <label>Net Paid</label>
        <div className="mono strong">
          {fmtPHP(
            Math.round((money.dep + money.adds - money.refs) / 100)
          )}
        </div>
      </div>
      <div className="kv">
        <label>Balance Due</label>
        <div
          className="mono"
          style={{
            fontWeight: 700,
            color: money.balance > 0 ? "#b91c1c" : "#1f2937",
          }}
        >
          {fmtPHP(Math.round(money.balance / 100))}
        </div>
      </div>
    </div>
  );
})()}
                              <CustomerBlock title="Customer" row={r} />
                                {/* Items summary for this repair */}
                                <div className="span-2">
                                  <h4>Items</h4>
                                  <ul className="items">
                                    <li className="item">
                                      <div className="item-title">
                                        {r?.typeLabel || r?.typeId || "Repair"}
                                      </div>
                                      <div className="muted">
                                        {[
                                          r?.coverMaterialLabel ||
                                            r?.coverMaterialId,
                                          r?.frameMaterialLabel ||
                                            r?.frameMaterialId,
                                        ]
                                          .filter(Boolean)
                                          .join(" • ")}{" "}
                                        · Qty: 1
                                      </div>
                                      <div className="mono">
                                        {fmtPHP(r?.total ?? 0)}
                                      </div>
                                    </li>
                                  </ul>
                                </div>
                                {Array.isArray(r?.images) &&
                                  r.images.length > 0 && (

                                    <div className="span-2">
                                      <h4>Photos</h4>
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: 8,
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        {r.images.map((url, i) => (
                                          <a
                                            key={i}
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <img
                                              src={url}
                                              alt={`Repair ${i + 1}`}
                                              style={{
                                                width: 100,
                                                height: 100,
                                                objectFit: "cover",
                                                borderRadius: 8,
                                              }}
                                            />
                                          </a>
                                        ))}
                                      </div>
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

      {/* -------------------- CUSTOMIZATION TAB -------------------- */}
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
                        : customs.filter(
                            (c) => (c?.status || "draft") === btn.key
                          ).length}
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
                    const unit =
                      c?.unitPrice != null ? Number(c.unitPrice) : null;
                    const status = String(c?.status || "draft");
                    const draftStatus = customsDraft[id] ?? status;
                    const title =
                      c?.productTitle || c?.title || c?.name || "—";
                    const isOpen = expandedCustomId === id;

                    const linkedById = c?.orderId
                      ? rows.find((o) => o.id === c.orderId)
                      : null;
                    const linkedByFields =
                      rows.find(
                        (o) =>
                          String(o?.origin || "") === "customization" &&
                          (o?.customId === id ||
                            o?.linkedCustomId === id ||
                            o?.metadata?.customId === id)
                      ) || null;
                    const linkedOrder = linkedById || linkedByFields;
                    const mLinked = linkedOrder
                      ? computeMonies(linkedOrder)
                      : null;

                    const pay = String(
                      linkedOrder?.paymentStatus ??
                        c?.paymentStatus ??
                        "pending"
                    );

                    const depositProof =
                      c?.depositPaymentProofUrl ||
                      c?.paymentProofUrl ||
                      c?.paymentProofPath ||
                      null;
                    const additionalProofs = Array.isArray(
                      c?.additionalPaymentProofs
                    )
                      ? c.additionalPaymentProofs
                      : [];
                    const latestAdditional =
                      c?.lastAdditionalPaymentProofUrl ||
                      c?.lastAdditionalPaymentProofPath ||
                      null;

                    return (
                      <React.Fragment key={id}>
                        <tr>
                          <td className="mono">{id}</td>
                          <td>{when}</td>
                          <td title={cust}>{cust}</td>
                          <td>{title}</td>
                          <td>{c?.category || "—"}</td>
                          <td>{c?.size || "—"}</td>
                          <td>
                            {c?.cover
                              ? `${c.cover.materialType || "—"} / ${
                                  c.cover.color || "—"
                                }`
                              : "—"}
                          </td>
                          <td>{fmtAdditionals(c?.additionals) || "—"}</td>
                          <td>
                            {images.length || refImgs.length ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                {[...images, ...refImgs]
                                  .slice(0, 3)
                                  .map((url, i) => (
                                    <ResolvedImg
                                      key={i}
                                      pathOrUrl={url}
                                      alt={`Custom ${i + 1}`}
                                      size={40}
                                    />
                                  ))}
                                {[...images, ...refImgs].length > 3 && (
                                  <span className="muted">
                                    +{[...images, ...refImgs].length - 3}
                                  </span>
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="mono strong">
                            {unit != null ? fmtPHP(unit) : "—"}
                          </td>
                          <td>
                            <span
                              className={`badge status-${
                                status === "draft" ? "processing" : status
                              }`}
                            >
                              {status === "draft"
                                ? "DRAFT"
                                : (STATUS_LABEL[status] || status).toUpperCase()}
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
                              onChange={(e) =>
                                setCustomsDraft((p) => ({
                                  ...p,
                                  [id]: e.target.value,
                                }))
                              }
                            >
                              <option value="draft">Draft</option>
                              {STATUS_OPTIONS.map((opt) => (
                                <option
                                  key={opt.value}
                                  value={opt.value}
                                  
                                  disabled={SHIPPING_DRIVEN_STATUSES.has(
                                    opt.value
                                  )}
                                >
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              className="save-btn"
                              onClick={() => saveCustomStatus(id)}
                              disabled={
                                customsSaving[id] || draftStatus === status
                              }
                              type="button"
                              title={
                                draftStatus === status ? "No changes" : "Save"
                              }
                            >
                              {customsSaving[id] ? "Saving…" : "Save"}
                            </button>
                            <IconTrashBtn
                              color={clrCustom}
                              disabled={!!customDeleting[id]}
                              title="Delete customization order"
                              onClick={() => {
                                if (
                                  confirm(
                                    "Delete this customization order? This cannot be undone."
                                  )
                                ) {
                                  deleteCustomCascade(id);
                                }
                              }}
                            />
                          </td>
                          <td>
                            <ViewButton
                              rowId={id}
                              open={isOpen}
                              onClick={() =>
                                setExpandedCustomId(
                                  isOpen ? null : id
                                )
                              }
                            />
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={13}>
                              <div className="details-grid">
                                {/* Deposit proof */}
                                {depositProof && (
                                  <div className="span-2">
                                    <h4>Initial Payment Proof</h4>
                                    <ResolvedImg
                                      pathOrUrl={depositProof}
                                      alt="Initial Payment Proof"
                                      size={200}
                                    />
                                  </div>
                                )}

                                {/* Additional proofs */}
                                {(additionalProofs.length > 0 ||
                                  latestAdditional) && (
                                  <div className="span-2">
                                    <h4>Additional Payment Proofs</h4>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {additionalProofs.map((p, i) => (
                                        <ResolvedImg
                                          key={i}
                                          pathOrUrl={p?.url || p}
                                          alt={`Additional ${i + 1}`}
                                          size={120}
                                        />
                                      ))}
                                      {latestAdditional && (
                                        <ResolvedImg
                                          pathOrUrl={latestAdditional}
                                          alt="Latest Additional"
                                          size={120}
                                        />
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div className="span-2">
                                  <h4>Payment Status</h4>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 12,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <select
                                      className="status-select"
                                      value={
                                        linkedOrder?.paymentStatus ||
                                        c?.paymentStatus ||
                                        "pending"
                                      }
                                      onChange={(e) =>
                                        updatePaymentForCustomization(
                                          c,
                                          e.target.value
                                        )
                                      }
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="deposit_paid">
                                        Deposit_Paid
                                      </option>
                                      <option value="awaiting_additional_payment">
                                        Awaiting_Additional_Payment
                                      </option>
                                      <option value="paid">Paid</option>
                                      <option value="refunded">Refunded</option>
                                      <option value="rejected">Rejected</option>
                                    </select>

                                    {(() => {
                                      const target = linkedOrder || c;
                                      const money = linkedOrder
                                        ? mLinked
                                        : computeMonies(target);
                                      return money?.balance > 0 ? (
                                        <button
                                          className="save-btn"
                                          type="button"
                                          style={{ background: "#111827" }}
                                          onClick={() =>
                                            linkedOrder
                                              ? requestRemainingBalanceForOrder(
                                                  linkedOrder
                                                )
                                              : requestRemainingBalanceForCustom(
                                                  c
                                                )
                                          }
                                          title="Ask customer to pay the remaining balance"
                                        >
                                          Request: Pay Remaining Balance (₱
                                          {Math.round(
                                            money.balance / 100
                                          ).toLocaleString()}
                                          )
                                        </button>
                                      ) : null;
                                    })()}
                                  </div>
                                </div>

                                {/* Order total (linked order if exists, otherwise custom order doc) */}
{(() => {
  const target = linkedOrder || c;
  const money = linkedOrder ? mLinked : computeMonies(target);
  if (!money) return null;

  return (
    <div>
      <h4>Order Total</h4>
      <div className="kv">
        <label>Unit Price</label>
        <div className="mono">
          {fmtPHP(money.unitPHP)}
        </div>
      </div>
      <div className="kv">
        <label>Shipping</label>
        <div className="mono">
          {fmtPHP(money.shipPHP)}
        </div>
      </div>
      <div className="kv">
        <label>Total</label>
        <div className="mono strong">
          {fmtPHP(money.displayTotalPHP)}
        </div>
      </div>
      <div className="kv">
        <label>Net Paid</label>
        <div className="mono strong">
          {fmtPHP(
            Math.round((money.dep + money.adds - money.refs) / 100)
          )}
        </div>
      </div>
      <div className="kv">
        <label>Balance Due</label>
        <div
          className="mono"
          style={{
            fontWeight: 700,
            color: money.balance > 0 ? "#b91c1c" : "#1f2937",
          }}
        >
          {fmtPHP(Math.round(money.balance / 100))}
        </div>
      </div>
    </div>
  );
})()}


                                                                <CustomerBlock title="Customer" row={c} />

                                {/* Items (what the customer picked) */}
                                <div className="span-2">
                                  <h4>Items</h4>
                                  <ul className="items">
                                    {(() => {
                                      // Prefer items[] written by Payment.jsx.
                                      // For older docs (mobile or very old web), fall back to the top-level fields.
                                      const baseItems =
                                        Array.isArray(c?.items) && c.items.length
                                          ? c.items
                                          : [
                                              {
                                                title:
                                                  c?.productTitle ||
                                                  c?.title ||
                                                  c?.name ||
                                                  "Custom Furniture",
                                                qty: 1,
                                                price:
                                                  c?.unitPrice ??
                                                  c?.total ??
                                                  0,
                                              },
                                            ];

                                      return baseItems.map((it, i) => {
                                        // size/color/material: use item first, then doc-level
                                        const size =
                                          it?.size ||
                                          it?.selectedSize ||
                                          c?.size ||
                                          null;

                                        const color =
                                          it?.color ||
                                          it?.selectedColor ||
                                          it?.colorName ||
                                          c?.cover?.color ||
                                          null;

                                        const material =
                                          it?.material ||
                                          it?.selectedMaterial ||
                                          c?.cover?.materialType ||
                                          null;

                                        const variantParts = [
                                          size,
                                          color,
                                          material,
                                        ].filter(Boolean);

                                        // additionals: item-level first, else top-level c.additionals
                                        const addArr =
                                          Array.isArray(it?.additionals) &&
                                          it.additionals.length
                                            ? it.additionals
                                            : Array.isArray(c?.additionals) &&
                                              c.additionals.length
                                            ? c.additionals
                                            : [];

                                        const additionalsText = addArr.length
                                          ? `Additionals: ${addArr.join(", ")}`
                                          : "";

                                        return (
                                          <li key={i} className="item">
                                            <div className="item-title">
                                              {it?.title ||
                                                it?.name ||
                                                "Item"}
                                            </div>
                                            <div className="muted">
                                              {variantParts.length > 0 && (
                                                <>
                                                  {variantParts.join(" • ")}
                                                  {" · "}
                                                </>
                                              )}
                                              {additionalsText && (
                                                <>
                                                  {additionalsText}
                                                  {" · "}
                                                </>
                                              )}
                                              Qty: {it?.qty ?? 1}
                                            </div>
                                            <div className="mono">
                                              {fmtPHP(it?.price ?? 0)}
                                            </div>
                                          </li>
                                        );
                                      });
                                    })()}
                                  </ul>
                                </div>

                                {images.length > 0 && (
                                  <div className="span-2">
                                    <h4>Product Images</h4>

                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {images.map((url, i) => (
                                        <a
                                          key={i}
                                          href={url}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <img
                                            src={url}
                                            alt={`Custom ${i + 1}`}
                                            style={{
                                              width: 100,
                                              height: 100,
                                              objectFit: "cover",
                                              borderRadius: 8,
                                            }}
                                          />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {refImgs.length > 0 && (
                                  <div className="span-2">
                                    <h4>Reference Images (customer)</h4>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {refImgs.map((url, i) => (
                                        <ResolvedImg
                                          key={i}
                                          pathOrUrl={url}
                                          alt={`Reference ${i + 1}`}
                                          size={100}
                                        />
                                      ))}
                                    </div>
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
