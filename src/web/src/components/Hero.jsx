// src/components/Hero.jsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../Hero.css";

import img1 from "../assets/hero1.jpg";
import img2 from "../assets/hero2.jpg";
import img3 from "../assets/hero3.jpg";

const SLIDES = [img1, img2, img3];

export default function Hero() {
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    // Preload images
    SLIDES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % SLIDES.length);
    }, 4500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <section id="hero" className="hero">
      {/* LEFT PANEL */}
      <div className="panel">
        <div style={{ maxWidth: 520 }}>
          <h1>MAKE YOUR HOME FEEL NEW</h1>
          <p className="hero-subtitle">
            Discover fresh designs, cozy textures, and timeless pieces for every
            room.
          </p>

          <button className="btn" onClick={() => navigate("/all-furnitures")}>
            Shop Now
          </button>
        </div>
      </div>

      {/* RIGHT PANEL – SLIDER */}
      <div className="panel">
        <div
          className="hero-slider"
          aria-roledescription="carousel"
          aria-label="Hero image slideshow"
        >
          {SLIDES.map((src, i) => (
            <img
              key={src + i}
              src={src}
              alt="Furniture in a styled room"
              className={`hero-slide ${i === idx ? "is-active" : ""}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
