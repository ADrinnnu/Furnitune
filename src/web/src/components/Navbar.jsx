import React from "react";

export default function Navbar() {
  return (
    <header className="nav">
      <div className="top-bar container">
        <div className="brand">FURNITUNE</div>
        <div className="icons">
          <span>🔍</span>
          <span>♡</span>
          <span>🛒</span>
          <span>🔔</span>
          <span>👤</span>
        </div>
      </div>
      <div className="menu-bar container">
        <nav className="categories">
          <a href="/all-furnitures">ALL FURNITURES</a>
          <a href="#">IN STOCK</a>
          <a href="#">BEST SELLERS</a>
          <a href="#">NEW DESIGNS</a>
          <a href="#">LIVING ROOM</a>
          <a href="#">BEDROOM</a>
          <a href="#">DINING ROOM</a>
          <a href="#">OUTDOOR</a>
        </nav>
        <div className="actions">
          <a href="#">CUSTOMIZE</a>
          <span>|</span>
          <a href="#">REPAIR</a>
        </div>
      </div>
    </header>
  );
}
