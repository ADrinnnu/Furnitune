// src/pages/Notification.jsx
import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import {
  getFirestore, collection, query, where, orderBy, limit,
  onSnapshot, startAfter, getDocs, updateDoc, doc, serverTimestamp
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
  const [cursor, setCursor] = useState(null);

  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid || false)), []);

  const baseCol = useMemo(() => (uid ? collection(db, "users", uid, "notifications") : null), [db, uid]);

  // live list
  useEffect(() => {
    if (!baseCol) return;
    setInitialLoading(true);

    const constraints = [orderBy("createdAt", "desc"), limit(10)];
    if (filter === "unread") constraints.unshift(where("read", "==", false));

    const q = query(baseCol, ...constraints);
    const stop = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(docs);
      setCursor(snap.docs[snap.docs.length - 1] || null);
      setInitialLoading(false);
    });
    return stop;
  }, [baseCol, filter]);

  const loadMore = async () => {
    if (!baseCol || !cursor) return;
    setMoreLoading(true);

    const constraints = [orderBy("createdAt", "desc"), startAfter(cursor), limit(10)];
    if (filter === "unread") constraints.unshift(where("read", "==", false));

    const q = query(baseCol, ...constraints);
    const snap = await getDocs(q);
    setItems((prev) => [...prev, ...snap.docs.map((d) => ({ id: d.id, ...d.data() }))]);
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

  if (uid === null) {
    return (
      <div className="notifications-container">
        <div className="notifications-header"><h2>NOTIFICATIONS</h2></div>
        <div className="notifications-empty"><p>Please sign in to view notifications.</p></div>
      </div>
    );
  }

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
        </div>
      </div>

      {initialLoading ? (
        <div className="notifications-list">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="notification-item skeleton" role="status" aria-busy="true">
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
                onKeyDown={(e) => (e.key === "Enter" ? markRead(n.id, n.link) : null)}
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
              {moreLoading ? "Loading…" : cursor ? "SEE PREVIOUS NOTIFICATIONS" : "NO MORE NOTIFICATIONS"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
