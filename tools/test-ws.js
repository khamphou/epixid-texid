// ESM script to simulate two WS clients with same cid
import WebSocket from 'ws';

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function run(){
  const url = 'ws://127.0.0.1:8787';
  const cid = 'TEST-CID-123';
  const pid1 = 'PID-A-'+Date.now();
  const pid2 = 'PID-B-'+Date.now();

  const a = new WebSocket(url);
  const b = new WebSocket(url);

  const log = (tag, ...args)=> console.log(`[${tag}]`, ...args);

  a.on('open', ()=>{ log('A','open'); a.send(JSON.stringify({ type:'hello', name:'A', cid, pid: pid1 })); });
  b.on('open', ()=>{ log('B','open'); b.send(JSON.stringify({ type:'hello', name:'B', cid, pid: pid2 })); });
  a.on('error', (e)=>{ log('A','error', e?.message||e); });
  b.on('error', (e)=>{ log('B','error', e?.message||e); });

  const onMsg = (tag)=>(data)=>{ try{ const txt = data.toString(); const m = JSON.parse(txt); if(m && m.type){ log(tag, 'msg', m.type, m.room ? `(room=${m.room})` : ''); if(m.type==='joined'){ log(tag,'joined room', m.room); } } else { log(tag,'msg raw', txt.slice(0,120)); } }catch(e){ log(tag,'raw', String(data||'')); } };
  a.on('message', onMsg('A'));
  b.on('message', onMsg('B'));

  // Wait a bit, then create a room from B
  await sleep(500);
  log('B','creating room');
  b.send(JSON.stringify({ type:'create', name:'TestRoom', ownerName:'B', ownerTop:0 }));

  // Keep alive for a while to observe
  for(let i=0;i<5;i++){
    await sleep(1000);
    try{ a.send(JSON.stringify({ type:'ping', cid })); }catch{}
    try{ b.send(JSON.stringify({ type:'ping', cid })); }catch{}
  }

  a.close(); b.close();
  await sleep(400);
  log('DONE');
}

run().catch(err=>{ console.error('ERR', err); process.exitCode=1; });
