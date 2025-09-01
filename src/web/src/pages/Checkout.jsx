// src/pages/Checkout.jsx
import React, { useState } from "react";
import { useCart } from "../state/CartContext";
import { useNavigate } from "react-router-dom";

export default function Checkout() {
  const { cartItems, subtotal } = useCart();
  const [shippingInfo, setShippingInfo] = useState({ name: "", address: "" });
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setShippingInfo((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    // Implement checkout submission logic
    alert("Order submitted!");
    navigate("/payment");
  };

  return (
    <div>
      <h3>Checkout</h3>
      <div>
        <h4>Shipping Information</h4>
        <input 
          type="text" 
          name="name" 
          value={shippingInfo.name} 
          placeholder="Name" 
          onChange={handleInputChange} 
        />
        <input 
          type="text" 
          name="address" 
          value={shippingInfo.address} 
          placeholder="Address" 
          onChange={handleInputChange} 
        />
      </div>
      <h4>Order Summary</h4>
      <ul>
        {cartItems.map(item => (
          <li key={item.id}>{item.title} x{item.qty} - ₱{item.price}</li>
        ))}
      </ul>
      <div>Total: ₱{subtotal}</div>
      <button onClick={handleSubmit}>Proceed to Payment</button>
    </div>
  );
}
