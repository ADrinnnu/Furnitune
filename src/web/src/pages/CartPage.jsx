import React from "react";
import { useCart } from "../state/CartContext.jsx";
import { Link } from "react-router-dom";

export default function CartPage() {
  const { items, subtotal, inc, dec, remove, clear } = useCart();

  return (
    <div className="container section">
      <h1>My Cart</h1>

      {items.length === 0 ? (
        <div className="card" style={{padding:18}}>
          <p className="muted">There is no selected product to be checked out.</p>
          <Link to="/all-furnitures" className="btn" style={{marginTop:10}}>Browse items</Link>
        </div>
      ) : (
        <>
          <div className="card" style={{padding:0, overflow:"hidden"}}>
            {items.map((i) => (
              <div key={i.id} style={{
                display:"grid",
                gridTemplateColumns:"64px 1fr auto auto auto",
                alignItems:"center",
                gap:12,
                padding:"12px 14px",
                borderBottom:"1px solid #eee"
              }}>
                <div style={{width:64, height:48, background:"#8aa397", borderRadius:8, overflow:"hidden"}}>
                  {i.thumb ? <img src={i.thumb} alt="" style={{width:"100%", height:"100%", objectFit:"cover"}}/> : null}
                </div>
                <div>
                  <div style={{fontWeight:700}}>{i.title}</div>
                  <div className="muted" style={{fontSize:12}}>{i.type}</div>
                </div>
                <div>₱{i.price.toFixed(2)}</div>
                <div style={{display:"flex", alignItems:"center", gap:6}}>
                  <button className="ghost-btn" onClick={() => dec(i.id)}>-</button>
                  <div style={{minWidth:24, textAlign:"center"}}>{i.qty}</div>
                  <button className="ghost-btn" onClick={() => inc(i.id)}>+</button>
                </div>
                <button className="ghost-btn" onClick={() => remove(i.id)}>Remove</button>
              </div>
            ))}
          </div>

          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16}}>
            <button className="ghost-btn" onClick={clear}>Clear cart</button>
            <div style={{display:"flex", alignItems:"center", gap:12}}>
              <div style={{fontWeight:800}}>Subtotal: ₱{subtotal.toFixed(2)}</div>
              <button className="btn">Checkout</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
