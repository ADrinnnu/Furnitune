import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../firebase";
import "../Login.css";
import "../auth.css";
import googleIcon from "../assets/Google.png";
import log from "../assets/log.png"


const AUTH_PAGES = ["/create-account", "/forgot-password", "/verify-email", "/login"];

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      const last = sessionStorage.getItem("lastNonAuthPath");
      nav(last || "/");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      const last = sessionStorage.getItem("lastNonAuthPath");
      nav(last || "/");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBack = () => {
    const last = sessionStorage.getItem("lastNonAuthPath");
    if (last && !AUTH_PAGES.includes(last)) {
      nav(last, { replace: true });
      return;
    }

    const from = location.state?.from;
    if (!from || AUTH_PAGES.includes(from)) {
      nav("/", { replace: true });
      return;
    }

    nav(-1);
  };

  return (
    <main className="login-page">
      <section className="login-left">
        <div className="login-left-inner">
          <button className="back-link" onClick={handleBack}>← Back</button>

          <h1 className="login-head">
            <span>LOG IN TO </span>
            <span>YOUR ACCOUNT</span>
          </h1>

          <form className="auth-card login-card" onSubmit={onSubmit}>
            <label className="field-label">Email*</label>
            <input
              className="field-email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label className="field-label">Password*</label>
            <div className="pw-wrap">
              <input
                className="field-password"
                type={showPw ? "text" : "password"}
                placeholder="Enter your password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
              <button
                type="button"
                className="pw-eye"
                aria-label="toggle password"
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>

            <div className="row between tiny">
              <label className="remember">
                <input type="checkbox" /> Remember Me
              </label>
              <Link
                to="/forgot-password"
                state={{ from: "/login" }}
                replace
                className="link-muted"
              >
                Forgot Password
              </Link>
            </div>

            {error && <div className="error">{error}</div>}

            <button type="submit" className="btn login-btn">LOG IN</button>

            <div className="or-row">
              <span className="line" />
              <span>OR</span>
              <span className="line" />
            </div>

            <div className="socials">
              <button
                type="button"
                className="social-btn"
                aria-label="Login with Google"
                onClick={handleGoogleLogin}
              >
                <img src={googleIcon} alt="Google" width="20" height="20" />
              </button>
            </div>

            <p className="muted small center">
              Don’t have an account?{" "}
              <Link
                to="/create-account"
                state={{ from: "/login" }}
                replace
                className="link-strong"
              >
                Sign Up.
              </Link>
            </p>
          </form>
        </div>
      </section>

      <section className="login-right">
        <div className="login-right">
        <img src={log} alt="Login background" className="login-bg" />
        <div className="welcome-text">
        <div className="welcome-sub">WELCOME!</div>
        <div className="welcome-brand">FURNITUNE</div>
  </div>
  </div>
      </section>
    </main>
  );
}
