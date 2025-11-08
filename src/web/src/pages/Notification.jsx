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
  documentId, // <-- added
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import "../Notification.css";

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

  // live list
  useEffect(() => {
    if (!baseCol) return;
    setInitialLoading(true);

    // For "all": order by createdAt desc (no composite index needed if you already have it).
    // For "unread": NO orderBy to avoid forcing a composite index; we'll sort client-side.
    let constraints = [];
    if (filter === "all") {
      constraints = [orderBy("createdAt", "desc"), limit(10)];
    } else {
      constraints = [where("read", "==", false), limit(10)];
    }

    const q = query(baseCol, ...constraints);
    const stop = onSnapshot(
      q,
      (snap) => {
        let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (filter === "unread") {
          docs.sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          );
        }
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

  const loadMore = async () => {
    if (!baseCol || !cursor) return;
    setMoreLoading(true);

    let constraints = [];
    if (filter === "all") {
      constraints = [orderBy("createdAt", "desc"), startAfter(cursor), limit(10)];
    } else {
      // default ordering by __name__ (doc id); allowed without index.
      constraints = [where("read", "==", false), startAfter(cursor), limit(10)];
    }

    const q = query(baseCol, ...constraints);
    const snap = await getDocs(q);

    let next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (filter === "unread") {
      next.sort(
        (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
    }

    setItems((prev) => [...prev, ...next]);
    setCursor(snap.docs[snap.docs.length - 1] || null);
    setMoreLoading(false);
  };

  const markRead = async (notifId, link) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, "users", uid, "notifications", notifId), {
        read: true,
        readAt: serverTimestamp(),
      });
      if (link) {
        if (link.startsWith("/")) navigate(link);
        else window.open(link, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.error("Failed to mark notification read:", e);
    }
  };

  // Bulk: mark all unread as read (in 500-doc batches)
  const markAllRead = async () => {
    if (!uid || !baseCol || bulkLoading) return;
    setBulkLoading(true);
    try {
      let totalUpdated = 0;
      // loop until no unread remain
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

  /**
   * AUTO-CLEANUP:
   * Delete notifications that point to an order that no longer exists.
   * Runs whenever the loaded notification list changes.
   */
  useEffect(() => {
    if (!uid || !items.length) return;

    // collect unique orderIds that appear in notifications
    const orderIds = Array.from(
      new Set(items.map((n) => n?.orderId).filter(Boolean))
    );
    if (!orderIds.length) return;

    // Firestore "in" filters accept max 10 ids at a time
    const chunks = [];
    for (let i = 0; i < orderIds.length; i += 10) {
      chunks.push(orderIds.slice(i, i + 10));
    }

    (async () => {
      try {
        const missing = new Set();

        // detect which orders are missing
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

        // prune notifications that reference missing orders
        const batch = writeBatch(db);
        items.forEach((n) => {
          if (n?.orderId && missing.has(n.orderId)) {
            const ref = doc(db, "users", uid, "notifications", n.id);
            batch.delete(ref);
          }
        });
        await batch.commit();
      } catch (e) {
        console.warn("Notification cleanup failed:", e?.message || e);
      }
    })();
  }, [db, uid, items]);

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

  const hasUnreadInView = items.some((n) => !n.read);

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
      ) : items.length === 0 ? (
        <div className="notifications-empty">
          <p>No notifications {filter === "unread" ? "unread " : ""}yet.</p>
        </div>
      ) : (
        <>
          <div className="notifications-list">
            {items.map((n) => (
              <div
                key={n.id}
                className={`notification-item${n.read ? "" : " unread"}`}
                onClick={() => markRead(n.id, n.link)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" ? markRead(n.id, n.link) : null
                }
              >
                {n.image ? <img src={n.image} alt="" /> : <div className="thumb" />}
                <div className="notification-text">
                  <h3>{n.title || "Notification"}</h3>
                  {n.body && <p>{n.body}</p>}
                  {n.createdAt?.toDate ? (
                    <small className="muted">
                      {n.createdAt.toDate().toLocaleString()}
                    </small>
                  ) : null}
                </div>
              </div>
            ))}
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
