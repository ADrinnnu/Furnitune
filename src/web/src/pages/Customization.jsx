import React from "react";


export default function Customization() {
  return (
    <div className="customization-container">
      <div className="customization-grid">
        
        <div className="left-side">
          <h1 className="title">FURNITURE CUZTOMIZATION</h1>

          <div className="preview-box">Preview</div>

          <div className="section">
            <h2 className="section-title">DESCRIPTION</h2>
            <p className="text">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent
              euismod, odio vitae viverra cursus, lacus justo vulputate nisi,
              nec ullamcorper nunc eros at massa. Sed eu aliquam mauris.
            </p>
          </div>

          <div className="section">
            <h2 className="section-title">STEPS</h2>
            <ul className="steps">
              <li>The first step is to choose type of furniture.</li>
              <li>The second step is to select size.</li>
              <li>The third step is to choose the desired color.</li>
              <li>The fourth step is to pick material depending on preference.</li>
              <li>The last step is to provide additional notes if necessary.</li>
            </ul>
          </div>
        </div>
  
        <div className="right-side">
          <div className="option">
            <h3 className="option-title">1 CHOOSE TYPE OF FURNITURE</h3>
            <div className="buttons-grid">
              <button>Sofa</button>
              <button>Chair</button>
              <button>Bed</button>
              <button>Table</button>
              <button>Benches</button>
              <button>Ottomans</button>
              <button>Sectionals</button>
            </div>
          </div>
             <hr />
      
          <div className="option">
            <h3 className="option-title">2 CHOOSE SIZE</h3>
            <div className="buttons-row">
              <button>S</button>
              <button>M</button>
              <button>L</button>
              <button>Custom</button>
            </div>
          </div>
            <hr />
 
          <div className="option">
            <h3 className="option-title">3 CHOOSE COLOR</h3>
            <div className="colors">
              <div className="color-box" style={{ background: "#D3C6B3" }}></div>
              <div className="color-box" style={{ background: "#A29B89" }}></div>
              <div className="color-box" style={{ background: "#5E5E5E" }}></div>
              <div className="color-box" style={{ background: "#B76E79" }}></div>
            </div>
          </div>

            <hr />
          <div className="option">
            <h3 className="option-title">4 CHOOSE MATERIAL</h3>
            <div className="buttons-row">
              <button>Wood</button>
              <button>Leather</button>
              <button>Fabric</button>
            </div>
          </div>

            <hr />
          <div className="option">
            <h3 className="option-title">5 ADDITIONALS</h3>
            <textarea placeholder="Write here..."></textarea>
          </div>

            <hr />
          <button className="place-order">PLACE ORDER</button>
        </div>
      </div>
    </div>
  );
}
