import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged, sendEmailVerification, signOut, reload } from "firebase/auth";
import "../auth.css";
import "../VerifyEmail.css";

export default function VerifyEmail() {
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const stop = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await reload(u);
        if (u.emailVerified) nav("/");
      }
    });
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => { stop(); clearInterval(t); };
  }, [nav]);

  const key = "verifyResendUntil";
  const now = Date.now();
  const until = useMemo(() => Number(localStorage.getItem(key) || 0), [tick]);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  const disabled = remaining > 0;

  const handleResend = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      const next = Date.now() + 60_000;
      localStorage.setItem(key, String(next));
      setMsg("Verification email sent.");
      setTick((x) => x + 1);
    } catch (e) {
      setMsg(e.message || "Failed to resend link.");
    }
  };

  const obfuscated = (user?.email || "").replace(/^(.).+(@.+)$/, (_m, a, b) => `${a}******${b}`);

  const handleGoHome = () => nav("/", { replace: true });
  const handleUseAnother = async () => {
    await signOut(auth);
    nav("/login", { replace: true, state: { from: "/verify-email" } });
  };

  return (
    <main className="verify-page">
      <section className="verify-left">
        <div className="verify-inner">
          <h1 className="verify-head"><span>VERIFY YOUR EMAIL</span></h1>

          <p className="verify-copy">
            We’ve sent a verification link to <strong>{obfuscated}</strong>. Please check your
            inbox and click the link to verify your email.
          </p>

          {msg && <div className="info">{msg}</div>}

          <div className="verify-actions">
            <button className="btn ghost" onClick={handleResend} disabled={disabled}>
              {disabled ? `RESEND IN ${remaining}s` : "RESEND"}
            </button>

            <div className="verify-links">
              <button className="link-strong" onClick={handleGoHome}>Go to Home</button>
              <button className="link-strong" onClick={handleUseAnother}>Use another account</button>
            </div>
          </div>
        </div>
      </section>

      <section className="verify-right">
        <div className="welcome">
          <div className="welcome-sub">WELCOME!</div>
          <div className="welcome-brand">FURNITUNE</div>
        </div>
      </section>
    </main>
  );
}
