// src/pages/MyPurchases.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  addDoc,
  getDocs,                 // ← ★ added
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "../MyPurchases.css";

/* ★ NEW: add the aggregate helpers */
import {
  addReviewWithAggregate,
  updateReviewWithAggregate,
} from "../utils/reviewsAggregateClient";

/* Tabs */
const STATUS_TABS = [
  { key: "all",        label: "ALL" },
  { key: "processing", label: "PROCESSING ORDER" },
  { key: "preparing",  label: "PREPARING" },
  { key: "to_ship",    label: "TO SHIP" },
  { key: "to_receive", label: "TO RECEIVE" },
  { key: "completed",  label: "COMPLETED" },
  { key: "to_rate",    label: "TO RATE" },
  { key: "cancelled",  label: "CANCELLED" },
  { key: "refund",     label: "RETURN/REFUND" },
];

const LOCK_CANCEL = ["preparing","to_ship","to_receive","completed","to_rate","cancelled","refund"];
const SHOW_TEXT_WHEN_EMPTY = true;

const fmtPHP = (n) => {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(Number(n) || 0);
  } catch {
    return "₱" + (Number(n) || 0).toFixed(2);
  }
};

function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

const statusText = (s) => {
  const map = {
    processing: "PENDING",
    preparing: "PREPARING",
    to_ship: "TO SHIP",
    to_receive: "TO RECEIVE",
    completed: "COMPLETED",
    to_rate: "TO RATE",
    refund: "RETURN/REFUND",
    cancelled: "CANCELLED",
  };
  return map[s] || String(s || "processing").toUpperCase().replaceAll("_", " ");
};

/* Origin helpers */
const getOriginKey = (o) => {
  if (o?.repairId) return "REPAIR";
  if (
    o?.origin === "customization" ||
    o?.orderType === "customization" ||
    o?.customizationId ||
    o?.customId ||
    (Array.isArray(o?.items) &&
      o.items.some(
        (it) =>
          it?.meta?.source === "customization" ||
          it?.meta?.custom === true ||
          it?.meta?.customization === true
      ))
  ) {
    return "CUSTOMIZATION";
  }
  return "CATALOG";
};

const originPillStyle = (key) => {
  const base = {
    display: "inline-block",
    marginLeft: 8,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    border: "1px solid",
    verticalAlign: "middle",
  };
  if (key === "REPAIR") {
    return { ...base, color: "#8b6b00", borderColor: "#f0e1a1", background: "#fff9e6" };
  }
  if (key === "CUSTOMIZATION") {
    return { ...base, color: "#5e31a6", borderColor: "#e1d1f7", background: "#f2eaff" };
  }
  return { ...base, color: "#2c5f4a", borderColor: "#dfe6e2", background: "#f5fbf8" };
};

/* Return window helper */
const DAY = 24 * 60 * 60 * 1000;
function getReturnInfo(order) {
  const startMs =
    tsToMillis(order?.deliveredAt) ||
    tsToMillis(order?.statusUpdatedAt) ||
    tsToMillis(order?.createdAt) ||
    0;
  const days = Number(order?.returnPolicyDays ?? 7);
  const endMs = startMs ? startMs + days * DAY : 0;
  return { startMs, endMs, ended: endMs ? Date.now() > endMs : false, days };
}

/* Fields where child (custom/repair) should override base order */
const PRIORITY_FIELDS = [
  "status",
  "paymentStatus",
  "paymentProofUrl",
  "depositPaymentProofUrl",
  "lastAdditionalPaymentProofUrl",
  "paymentProofType",
  "paymentProofPendingReview",
  "paymentProofUpdatedAt",
  "statusUpdatedAt",
  "deliveredAt",
  "returnLocked",
];

/* Create a merged view: child’s defined fields override base */
function mergeOverlay(base, child) {
  if (!child) return base;
  const out = { ...base };
  for (const k of PRIORITY_FIELDS) {
    if (child[k] !== undefined && child[k] !== null) out[k] = child[k];
  }
  return out;
}

/* ★ NEW: best-effort resolver so productIds is never empty */
async function resolveProductIds(db, order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  // 1) direct fields
  let pids = items
    .map((it) => it?.productId || it?.id || it?.slug)
    .filter(Boolean)
    .map(String);

  if (pids.length) {
    return Array.from(new Set(pids));
  }

  // 2) derive by slugifying title/name then querying products.slug
  const toSlug = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  const guesses = Array.from(
    new Set(
      items
        .map((it) => it?.slug || toSlug(it?.title || it?.name))
        .filter(Boolean)
    )
  );

  const hits = new Set();
  for (const slug of guesses) {
    try {
      const qSnap = await getDocs(query(collection(db, "products"), where("slug", "==", slug)));
      qSnap.forEach((d) => hits.add(d.id));
    } catch {
      /* ignore */
    }
  }

  return Array.from(hits);
}

export default function MyPurchases() {
  const navigate = useNavigate();
  const db = useMemo(() => getFirestore(auth.app), []);
  const storage = useMemo(() => getStorage(auth.app), []);

  const [uid, setUid] = useState(auth.currentUser?.uid || null);
  const [email, setEmail] = useState(auth.currentUser?.email || null);

  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");

  // Rating / Editing modal state
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingOrder, setRatingOrder] = useState(null);
  const [stars, setStars] = useState(5);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [editingReview, setEditingReview] = useState({ enabled: false, reviewId: null, existing: null });

  const [confirmReceive, setConfirmReceive] = useState({ open: false, order: null, submitting: false });

  const [reviewsByOrder, setReviewsByOrder] = useState({});

  /* NEW: caches for live merge */
  const ordersMapRef = React.useRef(new Map());
  const customsByOrderIdRef = React.useRef(new Map());
  const repairsByIdRef = React.useRef(new Map());

  const recomputeMerged = React.useCallback(() => {
    const list = [];
    ordersMapRef.current.forEach((o) => {
      let row = { ...o };
      const custom = customsByOrderIdRef.current.get(o.id);
      if (custom) row = mergeOverlay(row, custom);
      if (o.repairId) {
        const rep = repairsByIdRef.current.get(o.repairId);
        if (rep) row = mergeOverlay(row, rep);
      }
      list.push(row);
    });
    list.sort((a, b) => tsToMillis(b?.createdAt) - tsToMillis(a?.createdAt));
    setOrders(list);
  }, []);

  useEffect(() => {
    const stop = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid || null);
      setEmail(u?.email || null);
    });
    return stop;
  }, []);

  /* Live: ORDERS by uid OR email */
  useEffect(() => {
    ordersMapRef.current.clear();
    setOrders([]);
    if (!uid && !email) return;

    const unsubs = [];

    if (uid) {
      const q1 = query(collection(db, "orders"), where("userId", "==", uid));
      unsubs.push(
        onSnapshot(q1, (snap) => {
          snap.docChanges().forEach((ch) => {
            const id = ch.doc.id;
            if (ch.type === "removed") ordersMapRef.current.delete(id);
            else ordersMapRef.current.set(id, { id, ...ch.doc.data() });
          });
          recomputeMerged();
        })
      );
    }

    if (email) {
      const q2 = query(collection(db, "orders"), where("contactEmail", "==", email));
      unsubs.push(
        onSnapshot(q2, (snap) => {
          snap.docChanges().forEach((ch) => {
            const id = ch.doc.id;
            if (ch.type === "removed") ordersMapRef.current.delete(id);
            else ordersMapRef.current.set(id, { id, ...ch.doc.data() });
          });
          recomputeMerged();
        })
      );
    }

    return () => unsubs.forEach((fn) => fn && fn());
  }, [db, uid, email, recomputeMerged]);

  /* Live: CUSTOM_ORDERS overlay */
  useEffect(() => {
    customsByOrderIdRef.current.clear();
    if (!uid && !email) return;

    const unsubs = [];

    if (uid) {
      const q1 = query(collection(db, "custom_orders"), where("userId", "==", uid));
      unsubs.push(
        onSnapshot(q1, (snap) => {
          snap.docChanges().forEach((ch) => {
            const d = { id: ch.doc.id, ...ch.doc.data() };
            const key = d.orderId;
            if (!key) return;
            if (ch.type === "removed") customsByOrderIdRef.current.delete(key);
            else customsByOrderIdRef.current.set(key, d);
          });
          recomputeMerged();
        })
      );
    }

    if (email) {
      const q2 = query(collection(db, "custom_orders"), where("contactEmail", "==", email));
      unsubs.push(
        onSnapshot(q2, (snap) => {
          snap.docChanges().forEach((ch) => {
            const d = { id: ch.doc.id, ...ch.doc.data() };
            const key = d.orderId;
            if (!key) return;
            if (ch.type === "removed") customsByOrderIdRef.current.delete(key);
            else customsByOrderIdRef.current.set(key, d);
          });
          recomputeMerged();
        })
      );
    }

    return () => unsubs.forEach((fn) => fn && fn());
  }, [db, uid, email, recomputeMerged]);

  /* Live: REPAIRS overlay */
  useEffect(() => {
    repairsByIdRef.current.clear();
    if (!uid && !email) return;

    const unsubs = [];

    if (uid) {
      const q1 = query(collection(db, "repairs"), where("userId", "==", uid));
      unsubs.push(
        onSnapshot(q1, (snap) => {
          snap.docChanges().forEach((ch) => {
            const id = ch.doc.id;
            if (ch.type === "removed") repairsByIdRef.current.delete(id);
            else repairsByIdRef.current.set(id, { id, ...ch.doc.data() });
          });
          recomputeMerged();
        })
      );
    }

    if (email) {
      const q2 = query(collection(db, "repairs"), where("contactEmail", "==", email));
      unsubs.push(
        onSnapshot(q2, (snap) => {
          snap.docChanges().forEach((ch) => {
            const id = ch.doc.id;
            if (ch.type === "removed") repairsByIdRef.current.delete(id);
            else repairsByIdRef.current.set(id, { id, ...ch.doc.data() });
          });
          recomputeMerged();
        })
      );
    }

    return () => unsubs.forEach((fn) => fn && fn());
  }, [db, uid, email, recomputeMerged]);

  /* Live: my reviews (unchanged) */
  useEffect(() => {
    if (!uid) { setReviewsByOrder({}); return; }
    const q = query(collection(db, "reviews"), where("userId", "==", uid));
    const stop = onSnapshot(q, (snap) => {
      const counts = {};
      const latestMap = {};
      snap.forEach((docSnap) => {
        const r = { id: docSnap.id, ...docSnap.data() };
        const oid = r.orderId;
        counts[oid] = (counts[oid] || 0) + 1;
        const thisTs = tsToMillis(r.editedAt) || tsToMillis(r.createdAt);
        const prev = latestMap[oid];
        const prevTs = prev ? (tsToMillis(prev.editedAt) || tsToMillis(prev.createdAt)) : -1;
        if (!prev || thisTs > prevTs) latestMap[oid] = r;
      });
      const merged = {};
      Object.keys({ ...counts, ...latestMap }).forEach((oid) => {
        merged[oid] = { count: counts[oid] || 0, latest: latestMap[oid] || null };
      });
      setReviewsByOrder(merged);
    }, (e) => console.error("reviews listener:", e));
    return stop;
  }, [db, uid]);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => (o?.status || "processing") === filter);
  }, [orders, filter]);

  const openSummary = (orderId) => navigate(`/ordersummary?orderId=${orderId}`);

  const contactSeller = () => {
    window.location.href =
      "mailto:furnitune@sample.com?subject=Order%20Inquiry&body=Hi%2C%20I%27d%20like%20to%20ask%20about%20my%20order.";
  };

  const cancelOrder = async (orderId) => {
    if (!orderId) return;
    const ok = window.confirm("Cancel this order? This action can't be undone.");
    if (!ok) return;
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: "cancelled",
        statusUpdatedAt: serverTimestamp(),
      });
      alert("Your order has been cancelled.");
    } catch (e) {
      alert(e?.message || "Failed to cancel order.");
    }
  };

  /** Completed -> TO RATE, lock returns */
  const markOrderReceived = async (order) => {
    await updateDoc(doc(db, "orders", order.id), {
      status: "to_rate",
      statusUpdatedAt: serverTimestamp(),
      deliveredAt: serverTimestamp(),
      receivedConfirmedAt: serverTimestamp(),
      returnLocked: true,
    });

    if (uid) {
      await addDoc(collection(db, "users", uid, "notifications"), {
        userId: uid,
        type: "order_status",
        orderId: order.id,
        status: "to_rate",
        title: "Order received ✔",
        body: `Please rate order ${String(order.id).slice(0, 6)}.`,
        image: (order?.items?.[0]?.image || order?.items?.[0]?.img || null),
        link: `/ordersummary?orderId=${order.id}`,
        createdAt: serverTimestamp(),
        read: false,
      });
    }
  };

  const openConfirmReceive = (order) =>
    setConfirmReceive({ open: true, order, submitting: false });

  const closeConfirmReceive = () =>
    setConfirmReceive({ open: false, order: null, submitting: false });

  const confirmReceiveNow = async () => {
    if (!confirmReceive.order) return;
    try {
      setConfirmReceive((p) => ({ ...p, submitting: true }));
      await markOrderReceived(confirmReceive.order);
      closeConfirmReceive();
      setFilter("to_rate");
    } catch (e) {
      console.error(e);
      alert("Failed to mark as received.");
      setConfirmReceive((p) => ({ ...p, submitting: false }));
    }
  };

  // ----- Rating / Edit handlers -----
  const openRatePanel = (order, existingReview = null, isEdit = false) => {
    setRatingOrder(order);
    setStars(existingReview?.rating ?? 5);
    setMessage(existingReview?.message ?? "");
    setFile(null);
    setEditingReview({
      enabled: !!isEdit,
      reviewId: existingReview?.id || null,
      existing: existingReview || null,
    });
    setRatingOpen(true);
  };

  const submitRating = async () => {
    if (!ratingOrder || !uid) return;
    if (stars < 1 || stars > 5) { alert("Please select 1–5 stars."); return; }

    try {
      setSubmittingReview(true);

      // Upload optional image
      let imageUrl = editingReview.enabled
        ? (editingReview.existing?.imageUrl || null)
        : null;
      if (file) {
        const p = `reviews/${uid}/${ratingOrder.id}/${Date.now()}_${file.name}`;
        const r = ref(storage, p);
        await uploadBytes(r, file);
        imageUrl = await getDownloadURL(r);
      }

      const items = Array.isArray(ratingOrder.items) ? ratingOrder.items : [];
      // ★ Resolve productIds (robust to missing productId/id/slug)
      const productIds = await resolveProductIds(db, ratingOrder);

      const uName =
        auth.currentUser?.displayName ||
        ratingOrder?.shippingAddress?.fullName ||
        ratingOrder?.shippingAddress?.email ||
        "User";

      if (productIds.length === 0) {
        // As a last resort, still save a review without productIds (no aggregate update)
        await addDoc(collection(db, "reviews"), {
          userId: uid,
          userName: uName,
          orderId: ratingOrder.id,
          items: items.map((it) => ({
            productId: it.productId || it.id || null,
            title: it.title || it.name || "Item",
            qty: Number(it.qty || 1),
            price: Number(it.price || 0),
          })),
          rating: stars,
          message: message.trim(),
          imageUrl,
          createdAt: serverTimestamp(),
          editedOnce: false,
          version: 1,
          repairId: ratingOrder.repairId || null,
        });
        console.warn("Review saved without productIds; aggregate not updated.");
        setRatingOpen(false);
        setSubmittingReview(false);
        setEditingReview({ enabled: false, reviewId: null, existing: null });
        return;
      }

      if (editingReview.enabled && editingReview.reviewId) {
        // EDIT path — update rating/message/image and fix the product aggregate delta
        try {
          await updateReviewWithAggregate(db, editingReview.reviewId, {
            rating: stars,
            message: message.trim(),
            imageUrl,
          });
        } catch {
          // If old review lacks productIds, fall back to creating a fresh one
          await addReviewWithAggregate(db, {
            productIds,
            userId: uid,
            userName: uName,
            rating: stars,
            message: message.trim(),
            imageUrl,
            orderId: ratingOrder.id,
            items: items.map((it) => ({
              productId: it.productId || it.id || null,
              title: it.title || it.name || "Item",
              qty: Number(it.qty || 1),
              price: Number(it.price || 0),
            })),
          });
        }
      } else {
        // NEW review — create + aggregate update for the product(s)
        await addReviewWithAggregate(db, {
          productIds,
          userId: uid,
          userName: uName,
          rating: stars,
          message: message.trim(),
          imageUrl,
          orderId: ratingOrder.id,
          items: items.map((it) => ({
            productId: it.productId || it.id || null,
            title: it.title || it.name || "Item",
            qty: Number(it.qty || 1),
            price: Number(it.price || 0),
          })),
        });
      }

      setRatingOpen(false);
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to submit review.");
    } finally {
      setSubmittingReview(false);
      setEditingReview({ enabled: false, reviewId: null, existing: null });
    }
  };

  return (
    <div className="orders-container">
      {/* Tabs */}
      <div className="order-tabs">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            className={filter === t.key ? "active" : undefined}
            onClick={() => setFilter(t.key)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (SHOW_TEXT_WHEN_EMPTY ? <p className="muted">No orders yet.</p> : null)}

      {filtered.map((o) => {
        const items = Array.isArray(o?.items) ? o.items : [];
        const first = items[0] || {};
        const img = first.image || first.img || "/placeholder.jpg";
        const qty = items.reduce((s, it) => s + (Number(it?.qty) || 1), 0) || 1;
        const variation =
          first.size || first.variant || first.color || o?.coverMaterialLabel || "—";
        const status = String(o?.status || "processing");
        const cancelDisabled = LOCK_CANCEL.includes(status);

        const rInfo = reviewsByOrder[o.id] || { count: 0, latest: null };
        const hasReview = rInfo.count >= 1;
        const alreadyEditedOnce = !!rInfo.latest?.editedOnce || rInfo.count > 1;

        const showReturnInCompleted = status === "completed" && !o?.returnLocked;
        const canConfirmReceive = status === "completed" && !o?.returnLocked;

        const canRateHere = status === "to_rate" && !hasReview;
        const canEditReview = status === "to_rate" && hasReview && !alreadyEditedOnce;

        const originKey = getOriginKey(o);
        const { startMs, endMs, ended } = getReturnInfo(o);

        return (
          <div className="order-card" key={o.id}>
            <div className="order-header">
              <span>🪑 FURNITUNE</span>
              <span style={originPillStyle(originKey)}>{originKey}</span>
            </div>

            <div
              className="order-body"
              onClick={() => openSummary(o.id)}
              style={{ cursor: "pointer" }}
              title="Open order summary"
            >
              <img
                src={img}
                alt={first?.title || first?.name || "Product"}
                onError={(e) => (e.currentTarget.src = "/placeholder.jpg")}
              />
              <div className="order-info">
                <p className="order-title">
                  {first?.title || first?.name || (o.repairId ? "Repair Request #1" : "Order")}
                </p>
                <p className="order-seller">Variation: {variation}</p>
                <p className="order-qty">x{qty}</p>
              </div>
              <div className="order-right">
                <div className="order-price">{fmtPHP(o?.total)}</div>
                <span className={`status-chip status-${status.replaceAll("_","-")}`}>
                  {statusText(status)}
                </span>
              </div>
            </div>

            <div className="order-footer">
              <p className="order-total">Order Total: {fmtPHP(o?.total)}</p>

              {startMs > 0 && (
                <div className="muted" style={{ marginTop: 6 }}>
                  Return window ends on {new Date(endMs).toLocaleDateString()} • {ended ? "ended" : "active"}
                </div>
              )}

              <div className="order-actions">
                <button className="pending" type="button" disabled>
                  {statusText(status)}
                </button>

                {status === "completed" && (
                  <>
                    {canConfirmReceive && (
                      <button
                        className="pending"
                        type="button"
                        onClick={() => openConfirmReceive(o)}
                        title="Confirm you’ve received the item"
                      >
                        ORDER RECEIVE
                      </button>
                    )}
                    {showReturnInCompleted && (
                      <button
                        className="pending"
                        type="button"
                        onClick={() => navigate(`/return?orderId=${o.id}`)}
                      >
                        RETURN/REFUND
                      </button>
                    )}
                  </>
                )}

                {canRateHere && (
                  <button className="pending" onClick={() => openRatePanel(o)} type="button">
                    RATE PRODUCTS
                  </button>
                )}
                {canEditReview && (
                  <button
                    className="pending"
                    onClick={() => openRatePanel(o, rInfo.latest, true)}
                    type="button"
                    title="Edit your review once"
                  >
                    EDIT REVIEW
                  </button>
                )}

                <button className="pending" onClick={contactSeller} type="button">
                  CONTACT SELLER
                </button>

                <button
                  className="pending"
                  onClick={() => cancelOrder(o.id)}
                  type="button"
                  disabled={cancelDisabled}
                  title={cancelDisabled ? "Order can no longer be cancelled." : "Cancel order"}
                >
                  {status === "refund"
                    ? "WAITING FOR SELLER RESPONDS"
                    : status === "cancelled"
                    ? "CANCELLED"
                    : "CANCEL ORDER"}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Confirm RECEIVE Modal */}
      {confirmReceive.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => !confirmReceive.submitting && closeConfirmReceive()}
        >
          <div
            className="order-card"
            style={{ maxWidth: 520, width: "100%", cursor: "default" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-header"><span>Confirm Order Received</span></div>

            <div className="order-body" style={{ display: "block" }}>
              <p style={{ marginTop: 0 }}>
                You’re about to confirm you received this order.
              </p>
              <p style={{ marginBottom: 12 }}>
                <strong>Note:</strong> After confirming, this order will move to
                <strong> TO RATE</strong>, and you won’t be able to request a
                <strong> return/refund</strong> for it.
              </p>
            </div>

            <div className="order-footer">
              <div className="order-actions">
                <button
                  className="pending"
                  type="button"
                  onClick={closeConfirmReceive}
                  disabled={confirmReceive.submitting}
                >
                  CANCEL
                </button>
                <button
                  className="pending"
                  type="button"
                  onClick={confirmReceiveNow}
                  disabled={confirmReceive.submitting}
                >
                  {confirmReceive.submitting ? "UPDATING…" : "CONFIRM (MOVE TO TO RATE)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rating / Edit Modal */}
      {ratingOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => !submittingReview && setRatingOpen(false)}
        >
          <div
            className="order-card"
            style={{ maxWidth: 520, width: "100%", cursor: "default" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-header">
              <span>{editingReview.enabled ? "Edit your review" : "Rate your purchase"}</span>
            </div>

            <div className="order-body" style={{ display: "block" }}>
              <p><strong>User:</strong> {auth.currentUser?.displayName || auth.currentUser?.email || "You"}</p>
              <p>
                <strong>Order:</strong> {ratingOrder?.id?.slice(0, 8)} ·{" "}
                {(ratingOrder?.items?.[0]?.title || ratingOrder?.items?.[0]?.name || "Item")}
              </p>

              <div style={{ margin: "12px 0" }}>
                {[1,2,3,4,5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStars(n)}
                    type="button"
                    title={`${n} star${n>1?"s":""}`}
                    style={{ fontSize: 24, marginRight: 6, background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    {n <= stars ? "★" : "☆"}
                  </button>
                ))}
                <span style={{ marginLeft: 8 }}>{stars}/5</span>
              </div>

              <textarea
                placeholder="Share your experience (optional)…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                style={{ width: "100%" }}
              />

              <div style={{ marginTop: 8 }}>
                <label>Upload an image (optional)</label>
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>

            <div className="order-footer">
              <div className="order-actions">
                <button
                  className="pending"
                  type="button"
                  onClick={() => setRatingOpen(false)}
                  disabled={submittingReview}
                >
                  CLOSE
                </button>
                <button
                  className="pending"
                  type="button"
                  onClick={submitRating}
                  disabled={submittingReview}
                >
                  {submittingReview ? "SUBMITTING…" : (editingReview.enabled ? "SAVE EDIT" : "SUBMIT")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
