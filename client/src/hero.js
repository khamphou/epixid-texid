// Animation du hero: tétrominos néon qui flottent sous le menu

const TETROMINOES = {
  I: [[1,1,1,1]],
  O: [[1,1],[1,1]],
  T: [[1,1,1],[0,1,0]],
  S: [[0,1,1],[1,1,0]],
  Z: [[1,1,0],[0,1,1]],
  J: [[1,0,0],[1,1,1]],
  L: [[0,0,1],[1,1,1]]
};

function rand(min,max){ return Math.random()*(max-min)+min; }
function pick(arr){ return arr[(Math.random()*arr.length)|0]; }

export function initHero(){
  const bg = document.getElementById('hero-bg');
  const fx = document.getElementById('hero-fx');
  if(!bg || !fx) return;
  const bctx = bg.getContext('2d');
  const fctx = fx.getContext('2d');
  const state = { pieces:[], last:0, w:0, h:0, dpr:1, px:50, py:50 };

  function resize(){
    state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    state.w = bg.clientWidth|0; state.h = bg.clientHeight|0;
    for(const c of [bg,fx]){
      c.width = Math.floor(state.w*state.dpr);
      c.height = Math.floor(state.h*state.dpr);
      c.style.width = state.w+'px'; c.style.height = state.h+'px';
    }
    bctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    fctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  }

  function makePiece(){
    const type = pick(Object.keys(TETROMINOES));
    const mat = TETROMINOES[type];
    const depth = rand(0.6, 1.6); // plus grand = plus proche
    const size = rand(16, 36) * depth; // tailled des minos
    const hue = 196 + rand(-8, 10);
    const speed = rand(12, 40) * (2 - depth);
    const angle = rand(0, Math.PI*2);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    return {
      type, mat, depth, size, hue,
      x: rand(-100, state.w+100),
      y: rand(-100, state.h+100),
      vx, vy,
      rot: rand(0, Math.PI*2), vr: rand(-0.4, 0.4),
      alpha: rand(0.35, 0.75)
    };
  }

  function populate(n){
    state.pieces.length = 0;
    for(let i=0;i<n;i++) state.pieces.push(makePiece());
  }

  function drawPiece(ctx, p){
    const { mat, size, hue, rot, alpha } = p;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rot);
    // Glow
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = `hsla(${hue}, 90%, 60%, ${alpha*0.9})`;
    ctx.shadowBlur = Math.max(8, size*0.8);
    const rows = mat.length, cols = mat[0].length;
    const halfW = (cols*size)/2, halfH = (rows*size)/2;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if(!mat[r][c]) continue;
        const x = c*size - halfW;
        const y = r*size - halfH;
        drawRoundedMino(ctx, x, y, size, size, 6, hue, alpha);
      }
    }
    ctx.restore();
  }

  function drawRoundedMino(ctx, x,y,w,h, r, hue, alpha){
    ctx.fillStyle = `hsla(${hue}, 95%, 65%, ${alpha})`;
    // corps
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    // reflets internes
    ctx.fillStyle = `hsla(${hue+6}, 100%, 80%, ${alpha*0.65})`;
    roundRect(ctx, x+2, y+2, w-4, h-10, r*0.8);
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  function step(dt){
    const parx = (state.px-50)*0.06;
    const pary = (state.py-50)*0.06;
    for(const p of state.pieces){
      p.x += (p.vx + parx)*dt;
      p.y += (p.vy + pary)*dt;
      p.rot += p.vr*dt;
      // wrap doux
      const m = 120;
      if(p.x < -m) p.x = state.w + m;
      if(p.x > state.w + m) p.x = -m;
      if(p.y < -m) p.y = state.h + m;
      if(p.y > state.h + m) p.y = -m;
    }
  }

  function render(){
    bctx.clearRect(0,0,state.w,state.h);
    fctx.clearRect(0,0,state.w,state.h);
    // arrière-plan (distant)
    for(const p of state.pieces){ if(p.depth < 1.0) drawPiece(bctx, p); }
    // avant-plan (proche)
    for(const p of state.pieces){ if(p.depth >= 1.0) drawPiece(fctx, p); }
  }

  function loop(ts){
    const dt = state.last ? Math.min(0.05, (ts - state.last)/1000) : 0; state.last = ts;
    step(dt);
    render();
    requestAnimationFrame(loop);
  }

  function onMove(e){
    const rect = bg.getBoundingClientRect();
    const x = (e.clientX - rect.left)/rect.width*100;
    const y = (e.clientY - rect.top)/rect.height*100;
    state.px = Math.max(0, Math.min(100, x));
    state.py = Math.max(0, Math.min(100, y));
    // CSS vars pour la perspective du contenu
    bg.style.setProperty('--px', state.px);
    bg.style.setProperty('--py', state.py);
    fx.style.setProperty('--px', state.px);
    fx.style.setProperty('--py', state.py);
    const hero = document.querySelector('.hero-content');
    if(hero){ hero.style.setProperty('--px', state.px); hero.style.setProperty('--py', state.py); }
  }

  window.addEventListener('resize', resize);
  document.addEventListener('mousemove', onMove);
  resize();
  populate(26);
  requestAnimationFrame(loop);

  return () => {
    window.removeEventListener('resize', resize);
    document.removeEventListener('mousemove', onMove);
  };
}
