import { useState } from "react";
import { FaGoogle, FaFacebook, FaApple } from "react-icons/fa";
import "./LoginPage.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="login-container">
      {/* LEFT SIDE - LOGIN FORM */}
      <div className="login-left">
        <h2 className="login-title">
          LOG IN <br /> TO YOUR ACCOUNT
        </h2>

        {/* Email */}
        <div className="form-group">
          <label>Email*</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Password */}
        <div className="form-group">
          <label>Password*</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {/* Remember & Forgot */}
        <div className="form-options">
          <label>
            <input type="checkbox" /> Remember Me
          </label>
          <a href="#">Forgot Password</a>
        </div>

        {/* Login Button */}
        <button className="login-btn">LOG IN</button>

        {/* Divider */}
        <div className="divider">
          <hr /> <span>OR</span> <hr />
        </div>

        {/* Social Buttons */}
        <div className="social-login">
          <FaGoogle size={22} className="social-icon google" />
          <FaFacebook size={22} className="social-icon facebook" />
          <FaApple size={22} className="social-icon apple" />
        </div>

        {/* Sign Up */}
        <p className="signup-text">
          Don’t have an account? <a href="#">Sign Up</a>
        </p>
      </div>

      {/* RIGHT SIDE - IMAGE */}
      <div className="login-right">
        <div className="brand-box">
          <img
            src="https://i.ibb.co/q5hB3nM/chair.png"
            alt="Furniture"
            className="chair-img"
          />
          <h1 className="welcome-text">WELCOME</h1>
          <h2 className="brand-text">FURNITURE</h2>
        </div>
      </div>
    </div>
  );
}
