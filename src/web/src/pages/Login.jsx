// src/pages/Login.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import "../Login.css";   // split-hero layout + field widths
import "../auth.css";    // your existing button/input base styles

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      nav("/");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="login-page">
      {/* LEFT: form */}
      <section className="login-left">
        <div className="login-left-inner">
          <h1 className="login-head">
            <span>LOG IN</span>
            <span>TO YOUR</span>
            <span>ACCOUNT</span>
          </h1>

          <form className="auth-card login-card" onSubmit={onSubmit}>
            {/* EMAIL */}
            <label className="field-label">Email*</label>
            <input
              className="field"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              required
            />

            {/* PASSWORD (exact same width as email) */}
            <label className="field-label">Password*</label>
            <div className="pw-wrap">
              <input
                className="field pw-input"
                type={showPw ? "text" : "password"}
                placeholder="Enter your password"
                value={pw}
                onChange={(e)=>setPw(e.target.value)}
                required
              />
              <button
                type="button"
                className="pw-eye"
                aria-label="toggle password visibility"
                onClick={()=>setShowPw((s)=>!s)}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>

            <div className="row between tiny">
              <label className="remember">
                <input type="checkbox" /> Remember Me
              </label>
              <Link to="#" className="link-muted">Forgot Password</Link>
            </div>

            {error && <div className="error">{error}</div>}

            <button type="submit" className="btn login-btn">LOG IN</button>

            <div className="or-row">
              <span className="line" />
              <span>OR</span>
              <span className="line" />
            </div>

            <div className="socials">
              <button type="button" className="social-btn" aria-label="Login with Google">G</button>
              <button type="button" className="social-btn" aria-label="Login with Facebook">f</button>
              <button type="button" className="social-btn" aria-label="Login with Apple"></button>
            </div>

            <p className="muted small center">
              Don’t have an account?{" "}
              <Link to="/create-account" className="link-strong">Sign Up.</Link>
            </p>
          </form>
        </div>
      </section>

      {/* RIGHT: hero */}
      <section className="login-right">
        <div className="welcome">
          <div className="welcome-sub">WELCOME!</div>
          <div className="welcome-brand">FURNITUNE</div>
        </div>
      </section>
    </main>
  );
}
