// src/pages/Notification.jsx
import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  startAfter,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  writeBatch,
  documentId,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import "../Notification.css";

/* ---------- Status mappings (mirror of admin Orders UI) ---------- */
const STATUS_OPTIONS = [
  { value: "processing", label: "Processing" },
  { value: "preparing", label: "Preparing" },
  { value: "to_ship", label: "To Ship" },
  { value: "to_receive", label: "To Receive" },
  { value: "completed", label: "Completed" },
  { value: "refund", label: "Refund / Return" },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

// Payment statuses we show in badges
const PAYMENT_STATUSES = [
  "pending",
  "deposit_paid",
  "awaiting_additional_payment",
  "paid",
  "refunded",
  "rejected",
];
function paymentBadgeClass(ps) {
  const v = String(ps || "pending").toLowerCase();
  if (v === "paid") return "badge status-completed";
  if (v === "rejected") return "badge status-refund";
  if (v === "refunded") return "badge status-to-receive";
  if (v === "deposit_paid") return "badge status-preparing";
  if (v === "awaiting_additional_payment") return "badge status-to-receive";
  return "badge status-processing";
}

/* Important notif types we always show even without a link */
const IMPORTANT_TYPES = new Set([
  "order_status",                 // order status/policy changes, returns, etc.
  "repair_status",                // repair status updates
  "additional_payment_request",   // assessment + request
]);

/* ---------- timestamp helpers (robust ordering) ---------- */
function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.toDate === "function") return ts.toDate().getTime();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  if (typeof ts === "string") {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const n = Number(ts);
  return Number.isNaN(n) ? 0 : n;
}
// Prefer createdAt, then other meaningful server timestamps
function pickNotifMillis(n) {
  return (
    tsToMillis(n?.createdAt) ||
    tsToMillis(n?.additionalPaymentRequestedAt) ||
    tsToMillis(n?.assessedAt) ||
    tsToMillis(n?.paymentUpdatedAt) ||
    tsToMillis(n?.statusUpdatedAt) ||
    tsToMillis(n?.readAt) ||
    0
  );
}

export default function Notification() {
  const db = useMemo(() => getFirestore(auth.app), []);
  const navigate = useNavigate();

  const [uid, setUid] = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all"); // 'all' | 'unread'
  const [initialLoading, setInitialLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [cursor, setCursor] = useState(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || false)), []);

  const baseCol = useMemo(
    () => (uid ? collection(db, "users", uid, "notifications") : null),
    [db, uid]
  );

  /* ---------------- live list ---------------- */
  useEffect(() => {
    if (!baseCol) return;
    setInitialLoading(true);

    let constraints = [];
    if (filter === "all") {
      constraints = [orderBy("createdAt", "desc"), limit(10)];
    } else {
      // keep index-free; we'll sort client-side robustly
      constraints = [where("read", "==", false), limit(10)];
      // If you prefer server sort, add orderBy("createdAt","desc") and build index once.
    }

    const q = query(baseCol, ...constraints);
    const stop = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems(docs);
        setCursor(snap.docs[snap.docs.length - 1] || null);
        setInitialLoading(false);
      },
      (e) => {
        console.error("Notifications subscription error:", e);
        setInitialLoading(false);
      }
    );

    return stop;
  }, [baseCol, filter]);

  /* ---------- visibility + ordering ----------
     Show a card if it has a link target OR is an important status update,
     then sort newest -> oldest using timestamp fallbacks.
  -------------------------------------------- */
  const visibleItems = useMemo(() => {
    const filtered = items.filter((n) => {
      const hasTarget = !!(n.link || n.orderId);
      const isImportant = n?.type && IMPORTANT_TYPES.has(String(n.type));
      return hasTarget || isImportant;
    });
    return filtered.sort((a, b) => pickNotifMillis(b) - pickNotifMillis(a));
  }, [items]);

  /* ---------------- pagination ---------------- */
  const loadMore = async () => {
    if (!baseCol || !cursor) return;
    setMoreLoading(true);

    let constraints = [];
    if (filter === "all") {
      constraints = [orderBy("createdAt", "desc"), startAfter(cursor), limit(10)];
    } else {
      constraints = [where("read", "==", false), startAfter(cursor), limit(10)];
    }

    const q = query(baseCol, ...constraints);
    const snap = await getDocs(q);

    const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // merge then re-run the memo sort via state update
    setItems((prev) => [...prev, ...next]);
    setCursor(snap.docs[snap.docs.length - 1] || null);
    setMoreLoading(false);
  };

  /* ---------------- actions ---------------- */
  const markRead = async (notif) => {
    if (!uid) return;

    const resolvedLink =
      notif.link ||
      (notif.orderId ? `/ordersummary?orderId=${notif.orderId}` : null);

    try {
      await updateDoc(doc(db, "users", uid, "notifications", notif.id), {
        read: true,
        readAt: serverTimestamp(),
      });

      if (resolvedLink) {
        if (resolvedLink.startsWith("/")) navigate(resolvedLink);
        else window.open(resolvedLink, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.error("Failed to mark notification read:", e);
    }
  };

  // Mark all unread as read (batched)
  const markAllRead = async () => {
    if (!uid || !baseCol || bulkLoading) return;
    setBulkLoading(true);
    try {
      let totalUpdated = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const q = query(baseCol, where("read", "==", false), limit(500));
        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) =>
          batch.update(d.ref, { read: true, readAt: serverTimestamp() })
        );
        await batch.commit();
        totalUpdated += snap.size;

        await new Promise((r) => setTimeout(r, 0));
      }
      console.log(`Marked ${totalUpdated} notifications as read.`);
    } catch (e) {
      console.error("Failed to mark all notifications read:", e);
    } finally {
      setBulkLoading(false);
    }
  };

  /* -------- cleanup A: prune notifs pointing to deleted orders -------- */
  useEffect(() => {
    if (!uid || !items.length) return;

    const orderIds = Array.from(
      new Set(items.map((n) => n?.orderId).filter(Boolean))
    );
    if (!orderIds.length) return;

    const chunks = [];
    for (let i = 0; i < orderIds.length; i += 10) {
      chunks.push(orderIds.slice(i, i + 10));
    }

    (async () => {
      try {
        const missing = new Set();

        for (const chunk of chunks) {
          const q = query(
            collection(db, "orders"),
            where(documentId(), "in", chunk)
          );
          const snap = await getDocs(q);
          const found = new Set(snap.docs.map((d) => d.id));
          chunk.forEach((id) => {
            if (!found.has(id)) missing.add(id);
          });
        }

        if (!missing.size) return;

        const batch = writeBatch(db);
        items.forEach((n) => {
          if (n?.orderId && missing.has(n.orderId)) {
            batch.delete(doc(db, "users", uid, "notifications", n.id));
          }
        });
        await batch.commit();
      } catch (e) {
        console.warn("Notification cleanup failed:", e?.message || e);
      }
    })();
  }, [db, uid, items]);

  /* -------- cleanup B: prune true orphans (no link and no orderId) -------- */
  useEffect(() => {
    if (!uid || !items.length) return;

    const toDelete = items.filter(
      (n) => !n.orderId && !n.link && !IMPORTANT_TYPES.has(String(n.type || ""))
    );
    if (!toDelete.length) return;

    (async () => {
      try {
        const batch = writeBatch(db);
        toDelete.forEach((n) => {
          batch.delete(doc(db, "users", uid, "notifications", n.id));
        });
        await batch.commit();
      } catch (e) {
        console.warn("Orphan notification cleanup failed:", e?.message || e);
      }
    })();
  }, [db, uid, items]);

  /* ---------------- render ---------------- */
  if (uid === null) {
    return (
      <div className="notifications-container">
        <div className="notifications-header">
          <h2>NOTIFICATIONS</h2>
        </div>
        <div className="notifications-empty">
          <p>Please sign in to view notifications.</p>
        </div>
      </div>
    );
  }

  const hasUnreadInView = visibleItems.some((n) => !n.read);

  return (
    <div className="notifications-container">
      <div className="notifications-header">
        <h2>NOTIFICATIONS</h2>

        <div className="notifications-tabs">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
            type="button"
          >
            All
          </button>
          <button
            className={filter === "unread" ? "active" : ""}
            onClick={() => setFilter("unread")}
            type="button"
          >
            Unread
          </button>

          <button
            className="mark-all-btn"
            onClick={markAllRead}
            type="button"
            disabled={bulkLoading || !hasUnreadInView}
            aria-busy={bulkLoading ? "true" : "false"}
            title="Mark all unread notifications as read"
            style={{ marginLeft: 12 }}
          >
            {bulkLoading ? "Marking…" : "Mark all as read"}
          </button>
        </div>
      </div>

      {initialLoading ? (
        <div className="notifications-list">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="notification-item skeleton"
              role="status"
              aria-busy="true"
            >
              <div className="thumb" />
              <div className="notification-text">
                <h3 className="line" />
                <p className="line wide" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="notifications-empty">
          <p>No notifications {filter === "unread" ? "unread " : ""}yet.</p>
        </div>
      ) : (
        <>
          <div className="notifications-list">
            {visibleItems.map((n) => {
              const resolvedLink =
                n.link || (n.orderId ? `/ordersummary?orderId=${n.orderId}` : null);
              const hasLink = !!resolvedLink;

              const mainStatus = n.status && String(n.status).toLowerCase();
              const isPayment = PAYMENT_STATUSES.includes(mainStatus);

              return (
                <div
                  key={n.id}
                  className={`notification-item${n.read ? "" : " unread"}`}
                  onClick={() => hasLink && markRead(n)}
                  role={hasLink ? "button" : "article"}
                  tabIndex={hasLink ? 0 : -1}
                  onKeyDown={(e) =>
                    hasLink && e.key === "Enter" ? markRead(n) : null
                  }
                  title={hasLink ? "" : "No details available"}
                >
                  {n.image ? <img src={n.image} alt="" /> : <div className="thumb" />}
                  <div className="notification-text">
                    <h3>
                      {n.title || "Notification"}{" "}
                      {mainStatus && (
                        <span
                          className={
                            isPayment
                              ? paymentBadgeClass(mainStatus)
                              : `badge status-${mainStatus}`
                          }
                          style={{ marginLeft: 8 }}
                        >
                          {isPayment
                            ? mainStatus.toUpperCase()
                            : (STATUS_LABEL[mainStatus] || mainStatus).toUpperCase()}
                        </span>
                      )}
                    </h3>
                    {n.body && <p>{n.body}</p>}
                    {n.createdAt?.toDate ? (
                      <small className="muted">
                        {n.createdAt.toDate().toLocaleString()}
                      </small>
                    ) : (
                      // if createdAt hasn't resolved yet, show the best fallback used for sorting
                      <small className="muted">
                        {new Date(pickNotifMillis(n)).toLocaleString()}
                      </small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="notifications-footer">
            <button onClick={loadMore} disabled={!cursor || moreLoading} type="button">
              {moreLoading
                ? "Loading…"
                : cursor
                ? "SEE PREVIOUS NOTIFICATIONS"
                : "NO MORE NOTIFICATIONS"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
