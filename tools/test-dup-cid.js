// ESM script: test duplicate-cid connections and room creation against local server
// Requires: npm i (ws already in dependencies)
import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8787';

function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

function connect(name, cid){
  return new Promise((resolve)=>{
    const ws = new WebSocket(WS_URL);
    ws.on('open', ()=>{
      console.log(`[${name}] open`);
      ws.send(JSON.stringify({ type:'hello', cid, name }));
      resolve(ws);
    });
    ws.on('message', (buf)=>{
      try{ const msg = JSON.parse(String(buf));
        if(msg?.type==='joined') console.log(`[${name}] joined room=${msg.room}`);
        if(msg?.type==='rooms') console.log(`[${name}] rooms ${Array.isArray(msg.rooms)? msg.rooms.length : '?'}`);
        if(msg?.type==='players') console.log(`[${name}] players ${Array.isArray(msg.players)? msg.players.length : '?'}`);
        if(msg?.type==='error') console.log(`[${name}] error`, msg);
      }catch{}
    });
    ws.on('close', (code, reason)=>{
      console.log(`[${name}] close code=${code} reason=${reason}`);
    });
    ws.on('error', (err)=>{
      console.log(`[${name}] error:`, err?.message||err);
    });
  });
}

(async()=>{
  const cid = 'TEST-CID-123';
  const A = await connect('A', cid);
  await delay(150);
  const B = await connect('B', cid);

  // give time for hellos to be processed without triggering rate-limit (<200ms)
  await delay(300);
  console.log('[B] creating room');
  B.send(JSON.stringify({ type:'create', name:'BR Test', ownerName:'B', ownerTop:0, modeId:'br10' }));

  await delay(1500);
  try{ A.close(); }catch{}
  try{ B.close(); }catch{}
})();
