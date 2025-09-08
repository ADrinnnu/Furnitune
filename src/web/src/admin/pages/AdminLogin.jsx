// src/admin/pages/AdminLogin.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { auth } from "../../firebase";
import "../admin.css";

export default function AdminLogin({ message = "" }) {
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(message);
  const [busy, setBusy] = useState(false);

  const isAdminUid = async (uid) => {
    try {
      const db = getFirestore(auth.app);
      // Debug: confirm which project the app is connected to
      console.log("[admin login] projectId:", auth.app.options.projectId, "uid:", uid);
      const snap = await getDoc(doc(db, "users", uid));
      const role = snap.exists() ? snap.data()?.role : null;
      console.log("[admin login] role from users/%s:", uid, role);
      return role === "admin";
    } catch (e) {
      console.warn("[admin login] getDoc failed:", e);
      return false;
    }
  };

  // Already signed in & admin? Skip the form
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      if (await isAdminUid(u.uid)) {
        const from = location.state?.from?.pathname || "/admin/users";
        nav(from, { replace: true });
      }
    });
    return () => unsub();
  }, []); // eslint-disable-line

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      if (await isAdminUid(user.uid)) {
        const from = location.state?.from?.pathname || "/admin/users";
        nav(from, { replace: true });
      } else {
        setError("This account is not allowed to access the admin.");
        try { await signOut(auth); } catch {}
      }
    } catch (err) {
      setError(err?.message || "Login failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-auth-wrap">
      <div className="admin-auth-left">
        <div className="admin-auth-inner">
          <h2 className="admin-auth-title">LOG IN<br />TO YOUR ACCOUNT</h2>

          {error && <div className="admin-auth-error">{error}</div>}

          <form onSubmit={onSubmit} className="admin-auth-form">
            <label className="admin-field-label">Email*</label>
            <input type="email" className="admin-input" placeholder="Enter your email"
              value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />

            <label className="admin-field-label">Password*</label>
            <div className="admin-password-row">
              <input type="password" className="admin-input" placeholder="Enter your password"
                value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              <span className="admin-eye" aria-hidden>👁</span>
            </div>

            <button type="submit" className="admin-login-btn" disabled={busy}>
              {busy ? "Logging in…" : "LOG IN"}
            </button>
          </form>

          <div className="admin-auth-footer">
            <Link to="/" className="admin-back-link">Back to site</Link>
          </div>
        </div>
      </div>

      <div className="admin-auth-right">
        <div className="admin-welcome">WELCOME!<br />FURNITUNE</div>
      </div>
    </div>
  );
}
