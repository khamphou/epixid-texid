// API REST (wrapper minimal)

export class ApiClient{
  constructor(base=''){
    this.base = base || '';
  }
  async get(path){ const r = await fetch(this.base+path, { cache:'no-store' }); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
  async post(path, body){ const r = await fetch(this.base+path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json().catch(()=>({ok:true})); }
}
