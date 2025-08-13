import WebSocket from 'ws';

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run(){
  const url = 'ws://127.0.0.1:8787';
  const cid = 'STICKY-CID-1';
  const pid = 'STICKY-PID-'+Date.now();
  const ws = new WebSocket(url);
  ws.on('open', async ()=>{ console.log('[C] open'); ws.send(JSON.stringify({ type:'hello', name:'Sticky', cid, pid })); await sleep(300); console.log('[C] create'); ws.send(JSON.stringify({ type:'create', name:'StickyRoom', ownerName:'Sticky', ownerTop:0 })); });
  ws.on('error', (e)=>{ console.log('[C] error', e?.message||e); });
  let joined = false;
  ws.on('message', async (data)=>{
    try{
      const m = JSON.parse(data.toString());
      console.log('[C] msg', m.type);
      if(m.type==='rooms'){ console.log('[C] rooms', Array.isArray(m.rooms)? m.rooms.length: ''); }
      if(m.type==='joined'){
        joined = true;
        console.log('[C] joined', m.room);
        // Query HTTP /rooms to validate presence
        try{
          const res = await fetch('http://127.0.0.1:8787/rooms', { cache:'no-store' });
          const j = await res.json();
          console.log('[HTTP] /rooms ->', JSON.stringify(j));
        }catch(err){ console.log('[HTTP] fail', err?.message||err); }
        // Keep alive a bit
        for(let i=0;i<3;i++){ await sleep(1000); try{ ws.send(JSON.stringify({ type:'ping', cid })); }catch{} }
        await sleep(1200);
        ws.close();
      }
    }catch{}
  });

  // Fallback: si pas de 'joined' en 1.5s, interroger /rooms quand même
  setTimeout(async ()=>{
    if(joined) return;
    try{
      const res = await fetch('http://127.0.0.1:8787/rooms', { cache:'no-store' });
      const j = await res.json();
      console.log('[HTTP-fallback] /rooms ->', JSON.stringify(j));
    }catch(err){ console.log('[HTTP-fallback] fail', err?.message||err); }
  }, 1500);
}

run().catch(e=>{ console.error(e); process.exitCode=1; });
