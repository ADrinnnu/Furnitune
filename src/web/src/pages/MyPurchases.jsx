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
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "../MyPurchases.css";

/* Aggregate helpers */
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

const LOCK_CANCEL = [
  "preparing",
  "to_ship",
  "to_receive",
  "completed",
  "to_rate",
  "cancelled",
  "refund",
];
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
    processing: "PROCESSING",
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
    return {
      ...base,
      color: "#8b6b00",
      borderColor: "#f0e1a1",
      background: "#fff9e6",
    };
  }
  if (key === "CUSTOMIZATION") {
    return {
      ...base,
      color: "#5e31a6",
      borderColor: "#e1d1f7",
      background: "#f2eaff",
    };
  }
  return {
    ...base,
    color: "#2c5f4a",
    borderColor: "#dfe6e2",
    background: "#f5fbf8",
  };
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

/* Resolve product IDs for rating aggregates */
async function resolveProductIds(db, order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  let pids = items
    .map((it) => it?.productId || it?.id || it?.slug)
    .filter(Boolean)
    .map(String);

  if (pids.length) return Array.from(new Set(pids));

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
      const qSnap = await getDocs(
        query(collection(db, "products"), where("slug", "==", slug))
      );
      qSnap.forEach((d) => hits.add(d.id));
    } catch {
      // ignore
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
  const [editingReview, setEditingReview] = useState({
    enabled: false,
    reviewId: null,
    existing: null,
  });

  const [confirmReceive, setConfirmReceive] = useState({
    open: false,
    order: null,
    submitting: false,
  });

  const [reviewsByOrder, setReviewsByOrder] = useState({});

  const ordersMapRef = React.useRef(new Map());        // base orders/{id}
  const customsByOrderIdRef = React.useRef(new Map()); // custom_orders with orderId
  const standaloneCustomsRef = React.useRef(new Map()); // custom_orders without orderId
  const repairsByIdRef = React.useRef(new Map());       // repairs/{id}

  // resolved first image per order (for storage paths)
  const [resolvedImages, setResolvedImages] = useState({});

  const recomputeMerged = React.useCallback(() => {
    const list = [];
    const usedRepairIds = new Set();

    // 1) Base orders with overlays from custom_orders/repairs
    ordersMapRef.current.forEach((o) => {
      let row = { ...o, _source: "order" };
      const custom = customsByOrderIdRef.current.get(o.id);
      if (custom) row = mergeOverlay(row, custom);
      if (o.repairId) {
        const rep = repairsByIdRef.current.get(o.repairId);
        if (rep) {
          row = mergeOverlay(row, rep);
          usedRepairIds.add(o.repairId);
        }
      }
      list.push(row);
    });

    // 2) Standalone custom_orders (no orderId)
    standaloneCustomsRef.current.forEach((c) => {
      const firstImage =
        (Array.isArray(c.images) && c.images[0]) ||
        (Array.isArray(c.referenceImages) && c.referenceImages[0]) ||
        null;

      const syntheticItem = {
        productId: c.productId || null,
        id: c.productId || c.id || null,
        title: c.productTitle || "Custom Order",
        name: c.productTitle || "Custom Order",
        qty: 1,
        price: Number(c.unitPrice || 0) || 0,
        image: firstImage,
        size: c.size || null,
        meta: { source: "customization", custom: true },
      };

      const totalGuess =
        c.total ||
        c.unitPrice ||
        (typeof c.depositIntendedCents === "number"
          ? c.depositIntendedCents / 100
          : 0);

      const row = {
        id: c.id,
        customId: c.id,
        _source: "custom",
        origin: "customization",
        status: c.status || "processing",
        items: [syntheticItem],
        total: totalGuess,
        createdAt: c.createdAt || c.updatedAt || null,
        shippingAddress: c.shippingAddress || null,
        contactEmail: c.contactEmail || null,
        paymentStatus: c.paymentStatus || "pending",
        paymentProofPendingReview: !!c.paymentProofPendingReview,
      };

      list.push(row);
    });

    // 3) Standalone repairs (no orders/{orderId} row)
    repairsByIdRef.current.forEach((r, rid) => {
      if (usedRepairIds.has(rid)) return; // already overlaid on an order

      const firstImage =
        (Array.isArray(r.images) && r.images[0]) ||
        (Array.isArray(r.referenceImages) && r.referenceImages[0]) ||
        null;

      const syntheticItem = {
        productId: null,
        id: r.id,
        title: r.furnitureType || r.productTitle || "Repair Order",
        name: r.furnitureType || r.productTitle || "Repair Order",
        qty: 1,
        price:
          typeof r.assessedTotalCents === "number"
            ? r.assessedTotalCents / 100
            : Number(r.estimatedCost || r.total || 0) || 0,
        image: firstImage,
        meta: { source: "repair", repair: true },
      };

      const totalGuess =
        r.total ||
        (typeof r.assessedTotalCents === "number"
          ? r.assessedTotalCents / 100
          : 0) ||
        (typeof r.depositIntendedCents === "number"
          ? r.depositIntendedCents / 100
          : 0);

      const row = {
        id: r.id,
        repairId: r.id,
        _source: "repair",
        origin: "repair",
        status: r.status || "processing",
        items: [syntheticItem],
        total: totalGuess,
        createdAt: r.createdAt || r.updatedAt || null,
        shippingAddress: r.shippingAddress || null,
        contactEmail: r.contactEmail || null,
        paymentStatus: r.paymentStatus || "pending",
        paymentProofPendingReview: !!r.paymentProofPendingReview,
      };

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
      const q2 = query(
        collection(db, "orders"),
        where("contactEmail", "==", email)
      );
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

  /* Live: CUSTOM_ORDERS overlay + standalone */
  useEffect(() => {
    customsByOrderIdRef.current.clear();
    standaloneCustomsRef.current.clear();
    if (!uid && !email) return;

    const unsubs = [];

    const handleCustomSnap = (snap) => {
      snap.docChanges().forEach((ch) => {
        const d = { id: ch.doc.id, ...ch.doc.data() };
        const key = d.orderId;
        const hasOrderId = !!key;

        if (hasOrderId) {
          if (ch.type === "removed") customsByOrderIdRef.current.delete(key);
          else customsByOrderIdRef.current.set(key, d);
        } else {
          if (ch.type === "removed") standaloneCustomsRef.current.delete(d.id);
          else standaloneCustomsRef.current.set(d.id, d);
        }
      });
      recomputeMerged();
    };

    if (uid) {
      const q1 = query(
        collection(db, "custom_orders"),
        where("userId", "==", uid)
      );
      unsubs.push(onSnapshot(q1, handleCustomSnap));
    }

    if (email) {
      const q2 = query(
        collection(db, "custom_orders"),
        where("contactEmail", "==", email)
      );
      unsubs.push(onSnapshot(q2, handleCustomSnap));
    }

    return () => unsubs.forEach((fn) => fn && fn());
  }, [db, uid, email, recomputeMerged]);

  /* Live: REPAIRS overlay + standalone */
  useEffect(() => {
    repairsByIdRef.current.clear();
    if (!uid && !email) return;

    const unsubs = [];

    const handleRepairSnap = (snap) => {
      snap.docChanges().forEach((ch) => {
        const id = ch.doc.id;
        if (ch.type === "removed") repairsByIdRef.current.delete(id);
        else repairsByIdRef.current.set(id, { id, ...ch.doc.data() });
      });
      recomputeMerged();
    };

    if (uid) {
      const q1 = query(collection(db, "repairs"), where("userId", "==", uid));
      unsubs.push(onSnapshot(q1, handleRepairSnap));
    }

    if (email) {
      const q2 = query(
        collection(db, "repairs"),
        where("contactEmail", "==", email)
      );
      unsubs.push(onSnapshot(q2, handleRepairSnap));
    }

    return () => unsubs.forEach((fn) => fn && fn());
  }, [db, uid, email, recomputeMerged]);

  /* Live: my reviews */
  useEffect(() => {
    if (!uid) {
      setReviewsByOrder({});
      return;
    }
    const q = query(collection(db, "reviews"), where("userId", "==", uid));
    const stop = onSnapshot(
      q,
      (snap) => {
        const counts = {};
        const latestMap = {};
        snap.forEach((docSnap) => {
          const r = { id: docSnap.id, ...docSnap.data() };
          const oid = r.orderId;
          counts[oid] = (counts[oid] || 0) + 1;
          const thisTs = tsToMillis(r.editedAt) || tsToMillis(r.createdAt);
          const prev = latestMap[oid];
          const prevTs = prev
            ? tsToMillis(prev.editedAt) || tsToMillis(prev.createdAt)
            : -1;
          if (!prev || thisTs > prevTs) latestMap[oid] = r;
        });
        const merged = {};
        Object.keys({ ...counts, ...latestMap }).forEach((oid) => {
          merged[oid] = { count: counts[oid] || 0, latest: latestMap[oid] || null };
        });
        setReviewsByOrder(merged);
      },
      (e) => console.error("reviews listener:", e)
    );
    return stop;
  }, [db, uid]);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => (o?.status || "processing") === filter);
  }, [orders, filter]);

  // resolve first-item image for each order (handles storage paths)
  useEffect(() => {
    (async () => {
      const updates = {};
      for (const o of filtered) {
        if (!o?.id) continue;
        if (resolvedImages[o.id]) continue;

        const items = Array.isArray(o?.items) ? o.items : [];
        const first = items[0] || {};
        const rawImg = first.image || first.img || "";

        if (!rawImg) continue;

        if (/^https?:\/\//i.test(rawImg)) {
          updates[o.id] = rawImg;
          continue;
        }

        try {
          const r = ref(storage, rawImg);
          const url = await getDownloadURL(r);
          updates[o.id] = url;
        } catch {
          // ignore; fall back to placeholder
        }
      }
      if (Object.keys(updates).length) {
        setResolvedImages((prev) => ({ ...prev, ...updates }));
      }
    })();
  }, [filtered, storage, resolvedImages]);

  const openSummary = (order) => {
    if (!order) return;
    if (order.repairId && order._source === "repair") {
      navigate(`/ordersummary?repairId=${order.repairId}`);
    } else if (order.repairId) {
      navigate(`/ordersummary?repairId=${order.repairId}`);
    } else if (order._source === "custom") {
      const cid = order.customId || order.id;
      navigate(`/ordersummary?customId=${cid}`);
    } else {
      navigate(`/ordersummary?orderId=${order.id}`);
    }
  };

  const contactSeller = () => {
    window.location.href =
      "mailto:furnitune@sample.com?subject=Order%20Inquiry&body=Hi%2C%20I%27d%20like%20to%20ask%20about%20my%20order.";
  };

  const cancelOrder = async (order) => {
    const status = order?.status || "processing";
    if (LOCK_CANCEL.includes(status)) return;

    const ok = window.confirm("Cancel this order? This action can't be undone.");
    if (!ok) return;

    const patch = {
      status: "cancelled",
      statusUpdatedAt: serverTimestamp(),
    };

    try {
      if (order._source === "order") {
        // main order doc
        await updateDoc(doc(db, "orders", order.id), patch);

        // mirror to linked custom/repair docs
        try {
          if (order.repairId) {
            await updateDoc(doc(db, "repairs", order.repairId), patch);
          } else {
            const cs = await getDocs(
              query(collection(db, "custom_orders"), where("orderId", "==", order.id))
            );
            const cRef = cs.docs[0]?.ref;
            if (cRef) await updateDoc(cRef, patch);
          }
        } catch (e) {
          console.warn("Overlay cancel mirror failed:", e?.message || e);
        }
      } else if (order._source === "repair" || order.repairId) {
        const rid = order.repairId || order.id;
        await updateDoc(doc(db, "repairs", rid), patch);
      } else if (order._source === "custom") {
        const cid = order.customId || order.id;
        await updateDoc(doc(db, "custom_orders", cid), patch);
      }

      alert("Your order has been cancelled.");
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to cancel order.");
    }
  };

  /** TO RECEIVE -> COMPLETED, also mirror to overlay doc (custom/repair) */
  const markOrderReceived = async (order) => {
    const completionPatch = {
      status: "completed",
      statusUpdatedAt: serverTimestamp(),
      deliveredAt: serverTimestamp(),
      receivedConfirmedAt: serverTimestamp(),
      returnLocked: true,
    };

    try {
      if (order._source === "repair" || order.repairId) {
        const rid = order.repairId || order.id;
        await updateDoc(doc(db, "repairs", rid), completionPatch);
      } else {
        // main order doc
        await updateDoc(doc(db, "orders", order.id), completionPatch);

        // mirror to overlays
        try {
          if (order?.repairId) {
            await updateDoc(doc(db, "repairs", order.repairId), completionPatch);
          } else {
            const cs = await getDocs(
              query(collection(db, "custom_orders"), where("orderId", "==", order.id))
            );
            const cRef = cs.docs[0]?.ref;
            if (cRef) {
              await updateDoc(cRef, completionPatch);
            }
          }
        } catch (e) {
          console.warn("Overlay mirror update failed:", e?.message || e);
        }
      }

      // notification
      if (uid) {
        if (order._source === "repair" || order.repairId) {
          const rid = order.repairId || order.id;
          await addDoc(collection(db, "users", uid, "notifications"), {
            userId: uid,
            type: "repair_status",
            repairId: rid,
            status: "completed",
            title: "Repair completed ✔",
            body: `Your repair ${String(rid).slice(0, 6)} is now completed.`,
            image:
              order?.items?.[0]?.image ||
              order?.items?.[0]?.img ||
              null,
            link: `/ordersummary?repairId=${rid}`,
            createdAt: serverTimestamp(),
            read: false,
          });
        } else {
          await addDoc(collection(db, "users", uid, "notifications"), {
            userId: uid,
            type: "order_status",
            orderId: order.id,
            status: "completed",
            title: "Order received ✔",
            body: `Your order ${String(order.id).slice(0, 6)} is now completed. Please rate your items.`,
            image:
              order?.items?.[0]?.image ||
              order?.items?.[0]?.img ||
              null,
            link: `/ordersummary?orderId=${order.id}`,
            createdAt: serverTimestamp(),
            read: false,
          });
        }
      }
    } catch (e) {
      console.error(e);
      alert("Failed to update order status.");
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
      setFilter("completed");
    } catch (e) {
      console.error(e);
      alert("Failed to mark as received.");
      setConfirmReceive((p) => ({ ...p, submitting: false }));
    }
  };

  // ----- NEW: centralized RETURN / REFUND navigation -----
  const handleReturnClick = (order) => {
    if (!order) return;

    // still skip explicit returns for repairs (same behavior as before)
    const isRepair = !!order?.repairId || getOriginKey(order) === "REPAIR";
    if (isRepair) return;

    if (order._source === "custom") {
      const cid = order.customId || order.id;
      navigate(`/return?customId=${cid}`);
    } else {
      // normal catalog order
      navigate(`/return?orderId=${order.id}`);
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
    if (stars < 1 || stars > 5) {
      alert("Please select 1–5 stars.");
      return;
    }

    try {
      setSubmittingReview(true);

      // Upload optional image
      let imageUrl = editingReview.enabled
        ? editingReview.existing?.imageUrl || null
        : null;
      if (file) {
        const p = `reviews/${uid}/${ratingOrder.id}/${Date.now()}_${file.name}`;
        const r = ref(storage, p);
        await uploadBytes(r, file);
        imageUrl = await getDownloadURL(r);
      }

      const items = Array.isArray(ratingOrder.items) ? ratingOrder.items : [];
      const productIds = await resolveProductIds(db, ratingOrder);

      const uName =
        auth.currentUser?.displayName ||
        ratingOrder?.shippingAddress?.fullName ||
        ratingOrder?.shippingAddress?.email ||
        "User";

      if (productIds.length === 0) {
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
        setRatingOpen(false);
        setSubmittingReview(false);
        setEditingReview({ enabled: false, reviewId: null, existing: null });
        return;
      }

      if (editingReview.enabled && editingReview.reviewId) {
        try {
          await updateReviewWithAggregate(db, editingReview.reviewId, {
            rating: stars,
            message: message.trim(),
            imageUrl,
          });
        } catch {
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

      {filtered.length === 0 &&
        (SHOW_TEXT_WHEN_EMPTY ? (
          <p className="muted">No orders yet.</p>
        ) : null)}

      {filtered.map((o) => {
        const items = Array.isArray(o?.items) ? o.items : [];
        const first = items[0] || {};
        const rawImg = first.image || first.img || "";
        const img = resolvedImages[o.id] || rawImg || "/placeholder.jpg";
        const qty =
          items.reduce((s, it) => s + (Number(it?.qty) || 1), 0) || 1;
        const variation =
          first.size ||
          first.variant ||
          first.color ||
          o?.coverMaterialLabel ||
          "—";
        const status = String(o?.status || "processing");

        const rInfo = reviewsByOrder[o.id] || { count: 0, latest: null };
        const hasReview = rInfo.count >= 1;
        const alreadyEditedOnce =
          !!rInfo.latest?.editedOnce || rInfo.count > 1;

        const isToReceive = status === "to_receive";

        // hide rating for repairs
        const isRepair = !!o?.repairId || getOriginKey(o) === "REPAIR";
        const canRateHere = status === "completed" && !hasReview && !isRepair;
        const canEditReview =
          status === "completed" && hasReview && !alreadyEditedOnce && !isRepair;

        const originKey = getOriginKey(o);
        const { startMs, endMs, ended } = getReturnInfo(o);

        const showCancel = status === "processing" && !LOCK_CANCEL.includes(status);

        return (
          <div className="order-card" key={o.id}>
            <div className="order-header">
              <span>🪑 FURNITUNE</span>
              <span style={originPillStyle(originKey)}>{originKey}</span>
            </div>

            <div
              className="order-body"
              onClick={() => openSummary(o)}
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
                  {first?.title ||
                    first?.name ||
                    (o.repairId ? "Repair Request #1" : "Order")}
                </p>
                <p className="order-seller">Variation: {variation}</p>
                <p className="order-qty">x{qty}</p>
              </div>
              <div className="order-right">
                <div className="order-price">{fmtPHP(o?.total)}</div>
                <span
                  className={`status-chip status-${status.replaceAll("_", "-")}`}
                >
                  {statusText(status)}
                </span>
              </div>
            </div>

            <div className="order-footer">
              <p className="order-total">Order Total: {fmtPHP(o?.total)}</p>

              {startMs > 0 && (
                <div className="muted" style={{ marginTop: 6 }}>
                  Return window ends on{" "}
                  {new Date(endMs).toLocaleDateString()} •{" "}
                  {ended ? "ended" : "active"}
                </div>
              )}

              <div className="order-actions">
                {isToReceive && (
                  <>
                    <button
                      className="pending"
                      type="button"
                      onClick={() => openConfirmReceive(o)}
                      title="Confirm you’ve received the item"
                    >
                      TO RECEIVE
                    </button>
                    {!isRepair && (
                      <button
                        className="pending"
                        type="button"
                        onClick={() => handleReturnClick(o)}
                      >
                        RETURN/REFUND
                      </button>
                    )}
                  </>
                )}

                {canRateHere && (
                  <button
                    className="pending"
                    onClick={() => openRatePanel(o)}
                    type="button"
                  >
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

                <button
                  className="pending"
                  onClick={contactSeller}
                  type="button"
                >
                  CONTACT SELLER
                </button>

                {showCancel && (
                  <button
                    className="pending"
                    onClick={() => cancelOrder(o)}
                    type="button"
                    title="Cancel order"
                  >
                    CANCEL ORDER
                  </button>
                )}
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
            <div className="order-header">
              <span>Confirm Order Received</span>
            </div>

            <div className="order-body" style={{ display: "block" }}>
              <p style={{ marginTop: 0 }}>
                You’re about to confirm you received this order.
              </p>
              <p style={{ marginBottom: 12 }}>
                <strong>Note:</strong> After confirming, this order will move to
                <strong> COMPLETED</strong>. You can then rate your items (not
                applicable for repairs). Returns will be disabled.
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
                  {confirmReceive.submitting
                    ? "UPDATING…"
                    : "CONFIRM (MOVE TO COMPLETED)"}
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
              <span>
                {editingReview.enabled ? "Edit your review" : "Rate your purchase"}
              </span>
            </div>

            <div className="order-body" style={{ display: "block" }}>
              <p>
                <strong>User:</strong>{" "}
                {auth.currentUser?.displayName ||
                  auth.currentUser?.email ||
                  "You"}
              </p>
              <p>
                <strong>Order:</strong> {ratingOrder?.id?.slice(0, 8)} ·{" "}
                {ratingOrder?.items?.[0]?.title ||
                  ratingOrder?.items?.[0]?.name ||
                  "Item"}
              </p>

              <div style={{ margin: "12px 0" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStars(n)}
                    type="button"
                    title={`${n} star${n > 1 ? "s" : ""}`}
                    style={{
                      fontSize: 24,
                      marginRight: 6,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
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
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setFile(e.target.files?.[0] || null)
                  }
                />
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
                  {submittingReview
                    ? "SUBMITTING…"
                    : editingReview.enabled
                    ? "SAVE EDIT"
                    : "SUBMIT"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
