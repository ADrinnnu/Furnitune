// src/components/FeatureStrip.jsx
import React from "react";
import "../FeatureStrip.css";

const items = [
  { title: "Best Sellers!",    text: "Explore what people love!",     icon: "★" },
  { title: "Collections!",     text: "Browse curated sets.",          icon: "▦" },
  { title: "Customization!",   text: "Choose design, fabric, color.", icon: "⚙︎" },
  { title: "Repair Services!", text: "Request repairs from home.",    icon: "🛠︎" },
];

export default function FeatureStrip() {
  return (
    <div className="pill-grid">
      {items.map((it, idx) => (
        <div className="pill" key={idx}>
          <div className="card"><span aria-hidden>{it.icon}</span></div>
          <div>
            <div className="title">{it.title}</div>
            <div className="muted">{it.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
