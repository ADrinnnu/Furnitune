// src/components/Hero.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../Hero.css"; 
import img1 from "../assets/hero1.jpg";
import img2 from "../assets/hero2.jpg";
import img3 from "../assets/hero3.jpg";

export default function Hero() {
  const navigate = useNavigate();

  const slides = [img1, img2, img3];

  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    slides.forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % slides.length);
    }, 4500);

    return () => clearInterval(timerRef.current);
  }, [slides]);

  return (
    <section id="hero" className="hero">
      {/* LEFT PANEL — unchanged */}
      <div className="panel" style={{ padding: 28 }}>
        <div style={{ maxWidth: 520 }}>
          <h1>
            MID-YEAR SALE
            <br />
            UP TO <b>15% OFF!</b>
          </h1>
          <p style={{ opacity: 0.95, lineHeight: 1.6 }}>
            20% off for orders ₱10,000 and below; 25% off for orders ₱20,000 and
            above.
          </p>
          <button className="btn" onClick={() => navigate("/all-furnitures")}>
            Shop Now
          </button>
        </div>
      </div>

      {/* RIGHT PANEL — same wrapper & styling; contents now slide */}
      <div className="panel" style={{ background: "#fff", display: "block" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
          }}
          aria-roledescription="carousel"
          aria-label="Hero image slideshow"
        >
          {slides.map((src, i) => (
            <img
              key={src + i}
              src={src}
              alt="Sofa"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                position: "absolute",
                inset: 0,
                transition: "opacity 600ms ease, transform 1200ms ease",
                opacity: i === idx ? 1 : 0,
                transform: i === idx ? "scale(1)" : "scale(1.02)",
                pointerEvents: i === idx ? "auto" : "none",
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
