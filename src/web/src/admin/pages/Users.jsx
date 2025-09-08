// src/admin/pages/Users.jsx
import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../firebase";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

export default function Users() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [qText, setQText] = useState("");

  useEffect(() => {
    const db = getFirestore(auth.app);
    const q = query(collection(db, "users"), orderBy("updatedAt", "desc"));
    const stop = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (e) => {
        setErr(e?.message || "Failed to load users.");
        setLoading(false);
      }
    );
    return () => stop();
  }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const hay = [
        r.id,
        r.email,
        r.name,
        r.role,
        r.uid, // in case you stored it as a field too
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(t);
    });
  }, [rows, qText]);

  const setRole = async (uid, role) => {
    try {
      const db = getFirestore(auth.app);
      await updateDoc(doc(db, "users", uid), {
        role,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      alert(e?.message || "Failed to update role.");
    }
  };

  const fmtWhen = (ts) => {
    if (!ts) return "";
    try {
      const d =
        typeof ts.toDate === "function"
          ? ts.toDate()
          : typeof ts.seconds === "number"
          ? new Date(ts.seconds * 1000)
          : new Date(ts);
      return isNaN(d) ? "" : d.toLocaleString();
    } catch {
      return "";
    }
  };

  return (
    <div className="admin-main">
      <h2 style={{ marginBottom: 12 }}>Users</h2>

      <div style={{ marginBottom: 12 }}>
        <input
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="Search by email, name, UID, role…"
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ccc",
            width: 320,
            maxWidth: "100%",
          }}
        />
      </div>

      {err && <div style={{ color: "crimson", marginBottom: 12 }}>{err}</div>}
      {loading && <div>Loading…</div>}
      {!loading && filtered.length === 0 && <div>No users found.</div>}

      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 720,
            }}
          >
            <thead>
              <tr>
                <th style={th}>UID</th>
                <th style={th}>Email</th>
                <th style={th}>Name</th>
                <th style={th}>Verified</th>
                <th style={th}>Role</th>
                <th style={th}>Updated</th>
                <th style={th} width="1">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const uid = u.id;
                const role = u.role || "user";
                return (
                  <tr key={uid}>
                    <td style={tdMono}>{uid}</td>
                    <td style={td}>{u.email || "—"}</td>
                    <td style={td}>{u.name || "—"}</td>
                    <td style={td}>{u.emailVerified ? "yes" : "no"}</td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 999,
                          background:
                            role === "admin" ? "rgba(16,185,129,.15)" : "rgba(59,130,246,.12)",
                          color: role === "admin" ? "#065f46" : "#1e3a8a",
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        {role.toUpperCase()}
                      </span>
                    </td>
                    <td style={td}>{fmtWhen(u.updatedAt || u.createdAt)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {role !== "admin" ? (
                        <button style={btn} onClick={() => setRole(uid, "admin")}>
                          Make admin
                        </button>
                      ) : (
                        <button style={btnGhost} onClick={() => setRole(uid, "user")}>
                          Remove admin
                        </button>
                      )}
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

/* small inline styles (doesn't change your existing CSS layout) */
const th = {
  textAlign: "left",
  fontWeight: 700,
  fontSize: 13,
  padding: "10px 8px",
  borderBottom: "1px solid #e5e7eb",
};
const td = { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" };
const tdMono = { ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 };

const btn = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #10b981",
  background: "#10b981",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const btnGhost = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #94a3b8",
  background: "transparent",
  color: "#334155",
  fontWeight: 700,
  cursor: "pointer",
};
