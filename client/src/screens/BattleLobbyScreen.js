import { RealtimeClient } from '../core/realtimeClient.js';

export class BattleLobbyScreen{
  constructor(core, { modeId, title, roomId=null }){ this.core=core; this.modeId=modeId; this.title=title||'Battle'; this.ws=null; this.off=[]; this.ready=false; this.peerReady=false; this.chat=[]; this.room=roomId||null; this.selfId=null; }
  async init(){
    this.ws = new RealtimeClient(); this.ws.connect(wsUrl());
    const { pid, cid, name } = ensureIdentity();
    this.ws.send('hello', { name, pid, cid }); this.ws.send('ping', { cid });
    // Rejoindre si un roomId est fourni, sinon créer
    if(this.room){ this.ws.send('join', { room: this.room }); }
    else { this.ws.send('create', { name: `${this.title||'Battle'} — ${name}`, ownerName: name, ownerTop: 0, modeId: this.modeId||null }); }
    this.off.push(this.ws.on('joined', (m)=>{ this.room=m.room; this.selfId=m.selfId; this._mountOverlay(); }));
  this.off.push(this.ws.on('ready', (m)=>{ if(m.who && m.who!==this.selfId) this.peerReady = !!m.ready; this._renderOverlay(); }));
    this.off.push(this.ws.on('peer', (m)=>{ this._toast = m.connected? 'Adversaire connecté' : 'Adversaire parti'; setTimeout(()=> this._toast='', 800); }));
    this.off.push(this.ws.on('countdown', ()=>{ this._count='GO'; this._renderOverlay(); }));
    this.off.push(this.ws.on('countdown_cancel', ()=>{ this._count=null; this._renderOverlay(); }));
    this.off.push(this.ws.on('start', async (m)=>{ const mod = await import('./MultiplayerGameScreen.js'); this.core.sm.replace(new mod.MultiplayerGameScreen(this.core, { ws: this.ws, meta: { room:this.room, selfId:this.selfId, started:true } })); }));
  // Chat messages
  this.off.push(this.ws.on('chat', (m)=>{ const from = m.from||'Lui'; const t = String(m.text||''); if(t){ this.chat.push({ me:false, t:`${from}: ${t}` }); this._renderOverlay(); } }));
  // Legacy emote-as-text fallback
  this.off.push(this.ws.on('emote', (m)=>{ const t = String(m.emoji||''); if(t){ this.chat.push({ me:false, t:`${t}` }); this._renderOverlay(); } }));
  }
  dispose(){ try{ this.ws?.close(); }catch{} this.off.forEach(off=>{ try{ off(); }catch{} }); this.off=[]; try{ this._root?.remove?.(); }catch{} }
  update(){}
  render(ctx){ const { canvas }=ctx; ctx.fillStyle='#0b0f14'; ctx.fillRect(0,0,canvas.width,canvas.height); }
  _mountOverlay(){ const r=document.createElement('div'); r.id='battle-lobby'; Object.assign(r.style,{ position:'fixed', inset:'0', display:'grid', placeItems:'center', zIndex:20, color:'#e5e7eb' }); r.innerHTML = `
      <div class="bl-panel">
        <h2 class="bl-title">${escapeHtml(this.title||'Battle')}</h2>
        <div class="bl-body">
          <div class="bl-row"><span>Salon:</span><code>${escapeHtml(this.room||'-')}</code></div>
          <div class="bl-row"><span>Moi:</span><strong>(prêt: <span id="me-ready">non</span>)</strong></div>
          <div class="bl-row"><span>Adversaire:</span><strong>(prêt: <span id="peer-ready">non</span>)</strong></div>
          <div class="bl-row">
            <button id="bl-ready" class="bl-btn primary">Je suis prêt</button>
            <button id="bl-leave" class="bl-btn">Quitter</button>
          </div>
          <div class="bl-chat" id="bl-chat" aria-live="polite"></div>
          <div class="bl-row"><input id="bl-input" class="bl-input" placeholder="Message…" /></div>
        </div>
      </div>`; const st=document.createElement('style'); st.textContent = `
        .bl-panel{ width:min(680px,92vw); background:linear-gradient(180deg, rgba(10,14,20,.94), rgba(10,14,20,.9)); border-radius:14px; padding:20px; box-shadow:0 10px 40px rgba(0,0,0,.55); }
        .bl-title{ margin:0 0 10px; font:600 22px Orbitron,system-ui; color:#93c5fd; }
        .bl-row{ display:flex; gap:10px; align-items:center; margin:8px 0; }
        .bl-btn{ border:0; background:#0f141a; color:#e5e7eb; padding:8px 12px; border-radius:10px; cursor:pointer; }
        .bl-btn.primary{ background:#0ea5e9; color:#0b0f14; }
        .bl-chat{ margin-top:10px; height:160px; overflow:auto; background:rgba(255,255,255,.03); border-radius:8px; padding:8px; font:13px system-ui; }
        .bl-input{ width:100%; border:1px solid rgba(148,163,184,.25); background:#0f141a; color:#e5e7eb; padding:8px 10px; border-radius:8px; }
      `; r.appendChild(st); document.body.appendChild(r); this._root=r; this._bindOverlay(); this._renderOverlay(); }
  _bindOverlay(){ const r=this._root; if(!r) return; r.querySelector('#bl-ready')?.addEventListener('click', ()=>{ this.ready=!this.ready; this.ws.send('ready', { ready:this.ready }); this._renderOverlay(); }); r.querySelector('#bl-leave')?.addEventListener('click', ()=> this._exit()); const inp=r.querySelector('#bl-input'); inp?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ const t=String(inp.value||'').slice(0,280); if(t){ this.chat.push({ me:true, t:`Moi: ${t}` }); this.ws.send('chat', { text: t }); inp.value=''; this._renderOverlay(); } } }); }
  _renderOverlay(){ const r=this._root; if(!r) return; const me=r.querySelector('#me-ready'); if(me) me.textContent = this.ready?'oui':'non'; const pr=r.querySelector('#peer-ready'); if(pr) pr.textContent = this.peerReady?'oui':'non'; const box=r.querySelector('#bl-chat'); if(box){ box.innerHTML = this.chat.map(x=> `<div>${x.me?'Moi':'Lui'}: ${escapeHtml(x.t)}</div>`).join(''); box.scrollTop = box.scrollHeight; } }
  _exit(){ try{ this.ws?.send('close', {}); }catch{} try{ document.getElementById('btn-exit')?.click(); }catch{} }
}

function ensureIdentity(){ const gen=(p)=> p+Math.random().toString(36).slice(2,8).toUpperCase()+'-'+Date.now().toString(36).toUpperCase(); let pid=null,cid=null,name=null; try{ pid=localStorage.getItem('texid_pid'); if(!pid){ pid=gen('P'); localStorage.setItem('texid_pid',pid);} }catch{} try{ cid=sessionStorage.getItem('texid_cid'); if(!cid){ cid=gen('S'); sessionStorage.setItem('texid_cid',cid);} }catch{} try{ name=localStorage.getItem('texid_name')||'Player'; }catch{ name='Player'; } return { pid,cid,name }; }
function wsUrl(){ try{ const dev=!!(import.meta&&import.meta.env&&import.meta.env.DEV); const proto=location.protocol==='https:'?'wss':'ws'; const host=dev?(location.hostname+':8787'):location.host; return `${proto}://${host}`; }catch{ return 'ws://localhost:8787'; } }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
