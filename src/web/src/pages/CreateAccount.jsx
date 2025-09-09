// src/pages/CreateAccount.jsx
import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase";
import { ensureUserDoc } from "../utils/ensureUserDoc";
import "../auth.css";
import "../CreateAccount.css";
import log from "../assets/log.png"


function CreateAccount() {
  const nav = useNavigate();
  const location = useLocation();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!first.trim() || !last.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (pw !== confirm) {
      setError("Passwords don’t match.");
      return;
    }

    try {
      setSaving(true);

      // 1) Create auth user
      const cred = await createUserWithEmailAndPassword(auth, email, pw);

      // 2) Set display name
      const displayName = `${first.trim()} ${last.trim()}`.trim();
      if (displayName) await updateProfile(cred.user, { displayName });

      // 3) Ensure Firestore profile exists (users/{uid}, role: "user")
      await ensureUserDoc(cred.user);

      // 4) Verify email + sign out
      await sendEmailVerification(cred.user);
      await signOut(auth);

      // 5) Go to verify-email page
      nav("/verify-email", { replace: true, state: { from: "/create-account" } });
    } catch (err) {
      setError(err?.message || "Failed to create account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="signup-page">
      <section className="signup-left">
        <div className="signup-left-inner">
          <h1 className="signup-head">
            <span>CREATE YOUR</span>
            <span>ACCOUNT</span>
          </h1>

          <form className="auth-card signup-card" onSubmit={onSubmit}>
  <div className="form-container">
    <div className="field-row">
      <div className="field">
        <label className="field-label">Given Name*</label>
        <input
          type="text"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label className="field-label">Last Name*</label>
        <input
          type="text"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          required
        />
      </div>
    </div>

    <label className="field-label">Email*</label>
    <input
      type="email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      required
    />

    <label className="field-label">Password*</label>
    <div className="pw-wrap">
      <input
        type={showPw ? "text" : "password"}
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        required
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShowPw((s) => !s)}
      >
        {showPw ? "🙈" : "👁️"}
      </button>
    </div>

    <label className="field-label">Confirm Password*</label>
    <div className="pw-wrap">
      <input
        type={showPw2 ? "text" : "password"}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShowPw2((s) => !s)}
      >
        {showPw2 ? "🙈" : "👁️"}
      </button>
    </div>

    {error && <div className="error">{error}</div>}

    <div className="signup-actions">
      <button type="submit" className="btn" disabled={saving}>
        {saving ? "Creating…" : "CREATE"}
      </button>
      <p className="muted small">
        Already have an account?{" "}
        <Link
          to="/login"
          replace
          state={{ from: "/create-account" }}
          className="link-strong"
        >
          Log in.
        </Link>
      </p>
    </div>
  </div>
</form>

        </div>
      </section>

      <section className="signin-right">
      <img src={log} alt="Background" className="signin-bg" />
          <div className="welcome-text">
          <div className="welcome-sub">WELCOME!</div>
          <div className="welcome-brand">FURNITUNE</div>
      </div>
</section>
    </main>
  );
}

export default CreateAccount;
