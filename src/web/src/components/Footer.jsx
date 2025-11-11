import React from "react";

const LinkItem = ({ children, href = "#", onClick }) => (
  <a className="ft-link" href={href} onClick={onClick}>
    {children}
  </a>
);

const Icon = ({ name }) => {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "facebook") return (
    <svg {...p}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
  );
  if (name === "instagram") return (
    <svg {...p}><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
  );
  if (name === "x") return (
    <svg {...p}><path d="M4 4l16 16M20 4L9.5 14.5M4 20l6.5-6.5"/></svg>
  );
  return null;
};

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-divider" />

      <div className="container footer-top">
        <div className="ft-col">
          <div className="ft-title">FURNITURES</div>
          <a href="/all" className="link-item">Furniture Types</a>
          <a href="/living-room" className="link-item">Living Room</a>
          <a href="/bedroom" className="link-item">Bed Room</a>
          <a href="/dining-room" className="link-item">Dining Room</a>
          <a href="/outdoor" className="link-item">Outdoor</a>
        </div>

        <div className="ft-col">
          <div className="ft-title">SUPPORT</div>
  <LinkItem 
    href="#" 
    onClick={(e) => {
      e.preventDefault();           
      if (window.FurnituneFAQ) {
        window.FurnituneFAQ.open(); 
      }
    }}> AI Chatbot
  </LinkItem>
</div>


        <div className="ft-col">
          <div className="ft-title">COMPANY</div>
          <a href="/aboutus" className="link-item">About Us</a>
        </div>

        <div className="ft-col">
          <div className="ft-title">VISIT US</div>
          <a href="/visitus" className="link-item">View Location</a>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-meta">
          <div className="meta-links">
            <span>© 2025 Furnitune, All Rights Reserved</span>
            <span className="meta-sep">|</span>
            <a href="/terms-of-service" className="ft-link">Terms of Service</a>
            <span className="meta-sep">|</span>
            <a href="/visitus" className="ft-link">Visit us Now</a>
            <span className="meta-sep">|</span>
          </div>

          <div className="socials">
<a
  className="icon-circle"
  aria-label="Facebook"
  href="https://www.facebook.com/people/Furnitune/61581022593293"
  target="_blank"
  rel="noopener noreferrer"
>
  <Icon name="facebook" />
</a>
            <a className="icon-circle" aria-label="Instagram" href="#"><Icon name="instagram" /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
