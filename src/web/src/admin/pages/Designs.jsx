import React, { useEffect, useMemo, useState } from "react";
import { provider } from "../data";
import ConfirmLeave from "../components/ConfirmLeave";

const STATUSES = ["draft","active","archived"];

export default function Designs() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ status:"draft" });
  const [dirty, setDirty] = useState(false);

  useEffect(() => { provider.listDesigns().then(setRows); }, []);

  async function save() {
    setDirty(false);
    if (form.id) {
      const updated = await provider.updateDesign(form.id, form);
      setRows(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d));
    } else {
      const created = await provider.createDesign(form);
      setRows(prev => [created, ...prev]);
    }
    setForm({ status:"draft" });
  }

  return (
    <div>
      <ConfirmLeave when={dirty} />
      <h2>Designs</h2>

      <div className="admin-card" style={{marginBottom:12}}>
        <div style={{display:"grid", gridTemplateColumns:"2fr 4fr 1fr 140px", gap:8}}>
          <input className="admin-input" placeholder="Name" value={form.name ?? ""} onChange={e=>{setDirty(true); setForm(f=>({...f, name:e.target.value}));}} />
          <input className="admin-input" placeholder="Description" value={form.description ?? ""} onChange={e=>{setDirty(true); setForm(f=>({...f, description:e.target.value}));}} />
          <select className="admin-select" value={form.status ?? "draft"} onChange={e=>{setDirty(true); setForm(f=>({...f, status: e.target.value}));}}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="admin-btn primary" onClick={save}>{form.id ? "Save" : "Create"}</button>
        </div>
      </div>

      <table className="admin-table">
        <thead><tr><th>Name</th><th>Description</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td>{d.description ?? ""}</td>
              <td>{d.status}</td>
              <td><button className="admin-btn" onClick={()=>setForm(d)}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
