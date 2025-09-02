import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import "../FloatingRobot.css";

export default function FloatingRobot() {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const wrapRef = useRef(null);
  const loc = useLocation();

  // wiggle / movement effect on scroll
  useEffect(() => {
    const onScroll = () => setOffset(window.scrollY % 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close when the route changes (user navigates)
  useEffect(() => setOpen(false), [loc.pathname]);

  // click outside to close
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="fab-wrap"
      style={{ transform: `translateY(${offset * 0.2}px)` }}
    >
      <button
        type="button"
        className="fab-robot"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="fab-menu"
        title={open ? "Close menu" : "Open menu"}
      >
        🤖
      </button>

      {open && (
        <div id="fab-menu" className="fab-menu" role="menu">
          {/* ChatBot link (placeholder page for now) */}
          <Link className="fab-item" role="menuitem" to="/chatbot" title="ChatBot">
            💬
          </Link>
          {/* Recommender link */}
          <Link className="fab-item" role="menuitem" to="/recommender" title="Recommender">
            ✨
          </Link>
        </div>
      )}
    </div>
  );
}
