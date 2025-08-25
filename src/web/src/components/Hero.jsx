import React from "react";
import { useNavigate } from "react-router-dom";

export default function Hero(){
    const navigate = useNavigate();
  
  return (
    <section id="hero" className="hero">
      <div className="panel" style={{padding:28}}>
        <div style={{maxWidth:520}}>
          <h1>MID-YEAR SALE<br/>UP TO <b>15% OFF!</b></h1>
          <p style={{opacity:.95, lineHeight:1.6}}>
            20% off for orders ₱10,000 and below; 25% off for orders ₱20,000 and above.
          </p>
          <button className="btn" onClick={() => navigate("/all-furnitures")} >Shop Now</button>
        </div>
      </div>
      <div className="panel" style={{background:'#fff', display:'block'}}>
        <img
          src="https://images.unsplash.com/photo-1549187774-b4e9b0445b41?w=1200"
          alt="Sofa"
          style={{width:'100%',height:'100%',objectFit:'cover'}}
        />
      </div>
    </section>
  );
}
