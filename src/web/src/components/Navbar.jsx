import React from "react";
import { Link } from 'react-router-dom';


export default function Navbar() {
  return (
    <header className="nav">
      <div className="top-bar container">
        <Link to="/" className="brand" aria-label="Go to homepage">
          FURNITUNE
        </Link>
        <div className="icons">
          <span>🔍</span>
          <span>♡</span>
          <Link to="/cart" className="icon-btn" aria-label="Open cart">
            🛒
          </Link>
          <span>🔔</span>
          <span>👤</span>
        </div>
      </div>
      <div className="menu-bar container">
        <nav className="categories">
          <a href="/all-furnitures">ALL FURNITURES</a>
          <a href="/best-sellers">BEST SELLERS</a>
          <a href="/new-designs">NEW DESIGNS</a>
          <a href="/living-room">LIVING ROOM</a>
          <a href="/bed-room">BEDROOM</a>
          <a href="/dining-room">DINING ROOM</a>
          <a href="/out-door">OUTDOOR</a>
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
