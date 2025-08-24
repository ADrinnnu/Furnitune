import { useEffect, useState } from "react";
import React from "react";

import { provider } from "../data";
import ConfirmLeave from "../components/ConfirmLeave";

export default function Products(){
  const [items, setItems] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState({ currency:"USD", isActive:true, stock:0 });

  useEffect(() => { provider.listProducts().then(setItems); }, []);

  async function save(){
    setDirty(false);
    if (form.id) {
      const updated = await provider.updateProduct(form.id, form);
      setItems(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
    } else {
      const created = await provider.createProduct(form);
      setItems(prev => [created, ...prev]);
    }
    setForm({ currency:"USD", isActive:true, stock:0 });
  }

  return (
    <div>
      <ConfirmLeave when={dirty} />
      <div className="admin-toolbar"><h2>Products</h2></div>

      <div className="admin-card" style={{marginBottom:12}}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:8}}>
          <input className="admin-input" placeholder="SKU" value={form.sku ?? ""} onChange={e=>{setForm(f=>({...f, sku:e.target.value})); setDirty(true);}} />
          <input className="admin-input" placeholder="Name" value={form.name ?? ""} onChange={e=>{setForm(f=>({...f, name:e.target.value})); setDirty(true);}} />
          <input className="admin-input" placeholder="Design ID" value={form.designId ?? ""} onChange={e=>{setForm(f=>({...f, designId:e.target.value})); setDirty(true);}} />
          <input className="admin-input" type="number" placeholder="Price (cents)" value={form.priceCents ?? 0} onChange={e=>{setForm(f=>({...f, priceCents:+e.target.value})); setDirty(true);}} />
          <input className="admin-input" type="number" placeholder="Stock" value={form.stock ?? 0} onChange={e=>{setForm(f=>({...f, stock:+e.target.value})); setDirty(true);}} />
          <button className="admin-btn primary" onClick={save}>{form.id ? "Save" : "Create"}</button>
        </div>
      </div>

      <table className="admin-table">
        <thead><tr><th>SKU</th><th>Name</th><th>Price</th><th>Stock</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {items.map(p=>(
            <tr key={p.id}>
              <td>{p.sku}</td>
              <td>{p.name}</td>
              <td>{(p.priceCents/100).toFixed(2)} {p.currency}</td>
              <td>{p.stock}</td>
              <td>{p.isActive ? "Yes":"No"}</td>
              <td>
                <button className="admin-btn" onClick={()=>setForm(p)}>Edit</button>
                <button className="admin-btn" onClick={async()=>{ await provider.deleteProduct(p.id); setItems(prev=>prev.filter(x=>x.id!==p.id)); }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
