// src/Checkout.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OrderSummaryCard from "../components/OrderSummaryCard";
import { getCheckoutItems, clearCheckoutItems } from "../utils/checkoutSelection";
import { auth, firestore } from "../firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

export default function Checkout() {
  const navigate = useNavigate();
  const pending = getCheckoutItems(); // items set by Buy Now or Cart checkout

  const [email, setEmail] = useState("");
  const [news, setNews] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [street, setStreet] = useState("");
  const [apt, setApt] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");

  const shippingFee = 510;
  const discount = 69;

  const subtotal = useMemo(
    () => pending.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 1)), 0),
    [pending]
  );
  const total = Math.max(0, subtotal - discount + shippingFee);

  async function handleContinueToPay() {
    if (!pending.length) return alert("No items to checkout.");
    if (!email || !first || !last || !street || !city || !stateProv || !zip || !phone) {
      alert("Please fill out all required fields.");
      return;
    }

    let user = auth.currentUser;
    if (!user) {
      try {
        const cred = await signInAnonymously(auth);
        user = cred.user;
      } catch {
        alert("Please log in before checking out.");
        return;
      }
    }

    const shippingAddress = {
      fullName: `${first} ${last}`.trim(),
      firstName: first,
      lastName: last,
      email,
      phone,
      line1: street,
      line2: apt || "",
      city,
      province: stateProv,
      zip,
      newsletterOptIn: !!news,
    };

    try {
      const orderData = {
        userId: user.uid,
        createdAt: serverTimestamp(),
        status: "processing",
        items: pending,
        subtotal,
        discount,
        shippingFee,
        total,
        shippingAddress,
        contactEmail: email,
        note: "Created from Checkout (pending items)",
      };
      const ref = await addDoc(collection(firestore, "orders"), orderData);
      clearCheckoutItems();
      navigate(`/Payment?orderId=${ref.id}`);
    } catch (e) {
      console.error(e);
      alert("Could not create order. Please try again.");
    }
  }

  return (
    <div className="checkout-container">
      {/* Left: Form */}
      <div className="checkout-form">
        <h3>EMAIL</h3>
        <input type="email" placeholder="*Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="checkbox">
          <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />{" "}
          Sign up for news & special offers?
        </label>

        <h3>SHIPPING ADDRESS</h3>
        <div className="form-grid">
          <input type="text" placeholder="*First Name" required value={first} onChange={(e) => setFirst(e.target.value)} />
          <input type="text" placeholder="*Last Name" required value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
        <input type="text" placeholder="*Street Address" required value={street} onChange={(e) => setStreet(e.target.value)} />
        <input type="text" placeholder="Apt/Suite # (Optional)" value={apt} onChange={(e) => setApt(e.target.value)} />
        <div className="form-grid">
          <input type="text" placeholder="*City" required value={city} onChange={(e) => setCity(e.target.value)} />
          <input type="text" placeholder="*State" required value={stateProv} onChange={(e) => setStateProv(e.target.value)} />
          <input type="text" placeholder="*Zip/Postal Code" required value={zip} onChange={(e) => setZip(e.target.value)} />
        </div>
        <input type="text" placeholder="*Phone Number" required value={phone} onChange={(e) => setPhone(e.target.value)} />

        <div className="form-actions">
          <button className="cancel-btn" onClick={() => navigate(-1)}>CANCEL</button>
          <button className="pay-btn" onClick={handleContinueToPay}>CONTINUE TO PAY</button>
        </div>
      </div>

      {/* Right: Summary (uses the items being bought right now) */}
      <OrderSummaryCard items={pending} discount={discount} shippingFee={shippingFee} />
    </div>
  );
}
