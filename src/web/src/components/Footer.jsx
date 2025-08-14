import React from "react";

export default function Footer(){
  return (
    <footer className="footer">
      <div className="container row" style={{justifyContent:'space-between'}}>
        <div>
          <div className="brand">FURNITUNE</div>
          <p className="muted">© 2025 Furnitune. All rights reserved.</p>
        </div>
        <div className="muted">
          <div>Privacy Policy · Terms of Service · FAQs</div>
          <div style={{marginTop:6}}>Visit us · Data Request Form</div>
        </div>
      </div>
    </footer>
  );
}
