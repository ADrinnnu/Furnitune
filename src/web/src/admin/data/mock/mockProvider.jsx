import { nanoid } from "nanoid";

// In-memory store
const mem = {
  user: { uid: "u1", email: "admin@example.com", emailVerified: true, role: "admin" },
  designs: [],
  products: [],
  orders: [],
  shipments: [],
  events: [],
  users: [{ uid:"u1", email:"admin@example.com", role:"admin" }]
};

// Seed
if (mem.designs.length === 0) {
  const d1 = { id: nanoid(), name:"Nordic Sofa", status:"active", createdAt: Date.now() };
  const d2 = { id: nanoid(), name:"Oak Table", status:"active", createdAt: Date.now() };
  mem.designs.push(d1, d2);

  const p1 = { id:nanoid(), designId:d1.id, sku:"SOF-001", name:"Nordic Sofa 2-seater", priceCents:59900, currency:"USD", stock:8, isActive:true, createdAt:Date.now() };
  const p2 = { id:nanoid(), designId:d2.id, sku:"TAB-002", name:"Oak Table 4ft",      priceCents:34900, currency:"USD", stock:3, isActive:true, createdAt:Date.now() };
  mem.products.push(p1, p2);
}

const allowed = {
  pending:["processing","cancelled"],
  processing:["ready_to_ship","cancelled"],
  ready_to_ship:["shipped","cancelled"],
  shipped:["in_transit"],
  in_transit:["out_for_delivery"],
  out_for_delivery:["delivered"],
  delivered:["returned"],
  returned:[],
  cancelled:[]
};

export const mockProvider = {
  async getCurrentUser(){ return mem.user; },
  async requireRole(roles){ const u = mem.user; if (!u || !roles.includes(u.role)) throw new Error("Forbidden"); },

  async listDesigns(){ return mem.designs; },
  async createDesign(d){ const nd = { id:nanoid(), name:d.name, description:d.description, status:d.status ?? "draft", createdAt:Date.now() }; mem.designs.push(nd); return nd; },
  async updateDesign(id, d){ const i=mem.designs.findIndex(x=>x.id===id); if(i<0) throw new Error("Not found"); mem.designs[i]={...mem.designs[i],...d}; return mem.designs[i]; },

  async listProducts(){ return mem.products; },
  async createProduct(p){ const np = { id:nanoid(), designId:p.designId, sku:p.sku, name:p.name, priceCents:p.priceCents, currency:p.currency ?? "USD", stock:p.stock ?? 0, isActive:p.isActive ?? true, createdAt:Date.now() }; mem.products.push(np); return np; },
  async updateProduct(id, p){ const i=mem.products.findIndex(x=>x.id===id); if(i<0) throw new Error("Not found"); mem.products[i]={...mem.products[i], ...p}; return mem.products[i]; },
  async deleteProduct(id){ mem.products = mem.products.filter(x=>x.id!==id); },

  async listOrders(){ return mem.orders; },

  async listShipments(){ return mem.shipments; },
  async advanceShipment(id, to, note){
    const s = mem.shipments.find(x=>x.id===id); if(!s) throw new Error("Not found");
    if (!allowed[s.status].includes(to)) throw new Error(`Invalid ${s.status} -> ${to}`);
    const ev = { id:nanoid(), shipmentId:id, from:s.status, to, note, by:mem.user.uid, at:Date.now() };
    s.status = to; s.updatedAt = Date.now(); mem.events.push(ev);
  },
  async listShipmentEvents(id){ return mem.events.filter(e=>e.shipmentId===id); },

  async listUsers(){ return mem.users; },
  async setUserRole(uid, role){ const u = mem.users.find(x=>x.uid===uid); if(!u) throw new Error("Not found"); u.role = role; }
};
