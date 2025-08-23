import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import "../auth.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ ok: false, msg: "" });
  const [loading, setLoading] = useState(false);
  const location = useLocation();

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus({ ok: false, msg: "" });
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setStatus({ ok: true, msg: "Reset link sent! Please check your inbox (and spam)." });
    } catch (err) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Reset your password</h2>

        <label className="field-label">Email</label>
        <div className="auth-input-group">
          <input
            type="email"
            placeholder="Enter the email you used to sign up"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            required
          />
        </div>

        {status.msg && (
          <div className="error" style={{ color: status.ok ? "green" : "red" }}>
            {status.msg}
          </div>
        )}

        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </button>

        <p className="muted small center" style={{ marginTop: 8 }}>
          <Link to="/login" replace state={{ from: "/forgot-password" }} className="link-strong">
            Back to Login
          </Link>
        </p>
      </form>
    </main>
  );
}
