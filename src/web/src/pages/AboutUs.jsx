import React from "react";
import custom from "../assets/customizee.webp"
import repair from "../assets/reps.jpg"
import recommend from "../assets/recs.jpg"
import cpn from "../assets/cpn.jpeg"
import coco from "../assets/coco.jpg"
import "../AboutUs.css";


const AboutUs = () => {
  return (
    <div className="about-container">
      {/* Short Intro */}
      <div className="intro-section">
        <h1>About Furnitune</h1>
        <p>
          Furnitune is your one-stop platform for furniture sales, customization, 
          and repair management. We aim to blend modern technology with timeless 
          craftsmanship, offering a unique recommender system to help customers 
          find furniture that perfectly matches their style and needs.
        </p>
      </div>

      {/* Features Section */}
      <h2 className="section-title">Our Unique Features</h2>
      <div className="unique-grid">
        <div className="unique-card">
          <img src={custom} alt="Customization" className="unique-img" />
          <h3>Customization</h3>
          <p>
            Design furniture your way, choose the fabric, color, and style that
            fits your personality.
          </p>
        </div>

        <div className="unique-card">
          <img src={repair} alt="Repair Management" className="unique-img" />
          <h3>Repair Management</h3>
          <p>
            Extend the life of your furniture with our repair and care services,
            making every piece last longer.
          </p>
        </div>

        <div className="unique-card">
          <img src={recommend} alt="Recommender System" className="unique-img" />
          <h3>Recommender System</h3>
          <p>
            Unsure what fits your space? Our smart system suggests pieces based
            on your style and needs.
          </p>
        </div>
      </div>

      {/* Owner Section */}
      <div className="owner-section">
        <div className="owner-info">
          <h2>Meet the Owner</h2>
          <p>
            Furnitune was founded with a passion for furniture and design. Our
            owner believes in creating not just furniture, but memories—making
            each piece a part of your story.
          </p>
          <p className="location">
            📍 Location: Cristobal St. San Jose Concepcion, Tarlac
          </p>
          <p>
            📞 Contact: +63 912 345 6789 / (02) 1234-5678
          </p>
          <p>
            ⏰ Operating Hours: Mon - Sat, 9:00 AM - 7:00 PM
          </p>
        </div>
        <div className="owner-photo">
          <img src={coco} alt="Owner" />
        </div>
        <div className="location-photo">
          <img src={cpn} alt="Store Location" />
        </div>
      </div>
    </div>
  );
};

export default AboutUs;
