// src/admin/pages/AdminLogin.jsx
import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
import { isAdminEmail } from "../data/auth/rbac";
import "../admin.css";

export default function AdminLogin({ message = "" }) {
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(message);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);

      if (!isAdminEmail(user?.email || "")) {
        setError("This account is not allowed to access the admin.");
        setBusy(false);
        return;
      }

      // Go back to the page the guard wanted, or a sane default
      const from = location.state?.from?.pathname || "/admin/users";
      nav(from, { replace: true });
    } catch (err) {
      setError(err?.message || "Login failed. Please check your credentials.");
      setBusy(false);
    }
  };

  return (
    <div className="admin-auth-wrap">
      {/* Left panel – form */}
      <div className="admin-auth-left">
        <div className="admin-auth-inner">
          <h2 className="admin-auth-title">
            LOG IN<br />TO YOUR ACCOUNT
          </h2>

          {error && <div className="admin-auth-error">{error}</div>}

          <form onSubmit={onSubmit} className="admin-auth-form">
            <label className="admin-field-label">Email*</label>
            <input
              type="email"
              className="admin-input"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />

            <label className="admin-field-label">Password*</label>
            <div className="admin-password-row">
              <input
                type="password"
                className="admin-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
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

      {/* Right panel – brand */}
      <div className="admin-auth-right">
        <div className="admin-welcome">
          WELCOME!<br />FURNITUNE
        </div>
      </div>
    </div>
  );
}
