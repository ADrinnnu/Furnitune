import React from "react";

const items = [
  {title:'Best Sellers!', text:'Explore what people love!', icon:'★'},
  {title:'Collections!', text:'Browse curated sets.', icon:'▦'},
  {title:'Customization!', text:'Choose design, fabric, color.', icon:'⚙︎'},
  {title:'Repair Services!', text:'Request repairs from home.', icon:'🛠︎'},
];

export default function FeatureStrip(){
  return (
    <div className="pill-grid">
      {items.map((it,idx)=>(
        <div className="pill" key={idx}>
          <div className="card" style={{width:42,height:42,display:'grid',placeItems:'center',padding:0}}>
            {it.icon}
          </div>
          <div>
            <div style={{fontWeight:800}}>{it.title}</div>
            <div className="muted" style={{fontSize:14}}>{it.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
