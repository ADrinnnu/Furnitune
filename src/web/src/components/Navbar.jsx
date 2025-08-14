import React from "react";

export default function Navbar() {
  return (
    <header className="nav">
      <div className="container" style={{display:'flex',alignItems:'center',justifyContent:'space-between',height:64}}>
        <div className="brand">FURNITUNE</div>
        <nav style={{display:'flex',gap:14,alignItems:'center',fontWeight:600}}>
          <a href="#hero">Home</a>
          <a href="#best-sellers">Best Sellers</a>
          <a href="#collections">Collections</a>
        </nav>
      </div>
    </header>
  );
}
