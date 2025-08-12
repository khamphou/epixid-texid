// WebSocket wrapper (stub)

export class RealtimeClient{
  constructor(){ this.ws=null; this.handlers=new Map(); }
  connect(url){ if(this.ws) return; this.ws = new WebSocket(url); this.ws.onmessage = (e)=>{ try{ const m=JSON.parse(e.data); const h=this.handlers.get(m.type); h?.forEach(fn=>fn(m)); }catch{} } }
  on(type, fn){ const arr=this.handlers.get(type)||[]; arr.push(fn); this.handlers.set(type, arr); return ()=>{ this.handlers.set(type, (this.handlers.get(type)||[]).filter(f=>f!==fn)); } }
  send(type, payload){ this.ws?.send(JSON.stringify({type, ...payload})); }
}
