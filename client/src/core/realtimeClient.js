// WebSocket wrapper avec buffer et hello au connect

export class RealtimeClient{
  constructor(){ this.ws=null; this.handlers=new Map(); this.queue=[]; this.isOpen=false; this._helloSent=false; this._lastByType = new Map(); }
  connect(url){
    if(this.ws) return;
    const ws = new WebSocket(url);
    this.ws = ws; this.isOpen=false; this._helloSent=false;
    ws.onopen = ()=>{
      this.isOpen = true;
      // flush buffer
      try{ for(const msg of this.queue.splice(0)){ ws.send(msg); } }catch{}
      // envoyer un ping périodique pour garder la session vivante
      try{ this._pingIv = setInterval(()=>{ try{ if(this.isOpen) ws.send(JSON.stringify({ type:'ping' })); }catch{} }, 4000); }catch{}
    };
  ws.onmessage = (e)=>{ try{ const m=JSON.parse(e.data); if(m && m.type){ this._lastByType.set(m.type, m); } const h=this.handlers.get(m.type); if(h) for(const fn of h) fn(m); }catch{} };
    ws.onclose = ()=>{ this.isOpen=false; try{ if(this._pingIv) clearInterval(this._pingIv); }catch{} this._pingIv=null; };
    ws.onerror = ()=>{};
  }
  on(type, fn){ const arr=this.handlers.get(type)||[]; arr.push(fn); this.handlers.set(type, arr); // Rejouer le dernier snapshot si disponible
    const last = this._lastByType.get(type); if(last){ try{ fn(last); }catch{} }
    return ()=>{ this.handlers.set(type, (this.handlers.get(type)||[]).filter(f=>f!==fn)); } }
  send(type, payload){
    const data = JSON.stringify({ type, ...payload });
    if(this.ws && this.isOpen){ try{ this.ws.send(data); }catch{ this.queue.push(data); } }
    else { this.queue.push(data); }
  }
  close(){
    try{ if(this._pingIv) clearInterval(this._pingIv); }catch{} this._pingIv=null;
    try{ this.ws?.close?.(); }catch{}
    this.ws = null; this.isOpen=false; this.queue.length=0; this._lastByType.clear();
    // vider les handlers pour éviter les fuites
    this.handlers.clear();
  }
}
