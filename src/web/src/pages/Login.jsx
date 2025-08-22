import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import "../Login.css";     
import "../auth.css";     

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
      nav("/"); // go home after login
    } catch (err) {
      setError(err.message);
    }
  };

  const goBack = () => {
    nav(-1); // go back to previous page
  };

  return (
    <main className="login-page">
      {/* LEFT: form */}
      <section className="login-left">
        <div className="login-left-inner">
          {/* Back Button */}
          <div className="back-btn" onClick={goBack} role="button" aria-label="Go back">
            ← Back
          </div>

          <h1 className="login-head">
            <span>LOG IN TO </span>
            <span>YOUR ACCOUNT</span>
          </h1>

          <form className="auth-card login-card" onSubmit={onSubmit}>
            <label className="field-label">Email*</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              required
            />

            <label className="field-label">Password*</label>
            <div className="pw-wrap">
              <input
                type={showPw ? "text" : "password"}
                placeholder="Enter your password"
                value={pw}
                onChange={(e)=>setPw(e.target.value)}
                required
              />
              <button
                type="button"
                className="pw-eye"
                aria-label="toggle password"
                onClick={()=>setShowPw(s => !s)}
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

            <div className="btn-center">
              <button type="submit" className="btn login-btn">LOG IN</button>
            </div>

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
              Don’t have an account? <Link to="/create-account" className="link-strong">Sign Up.</Link>
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
