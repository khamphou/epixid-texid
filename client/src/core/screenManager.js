// Gestionnaire d'écrans (stack)

/** @typedef {{ init(params?:any):Promise<void>|void, update(dt:number):void, render(ctx:CanvasRenderingContext2D):void, handleInput(evt:Event):boolean|void, dispose():void }} IScreen */

export class ScreenManager{
  /** @param {HTMLElement} root */
  constructor(root){
    this.root = root;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.root.appendChild(this.canvas);
    this.stack = [];
    this.resize();
    window.addEventListener('resize', ()=> this.resize());
  }
  resize(){
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w*dpr);
    this.canvas.height = Math.floor(h*dpr);
    this.canvas.style.width = w+'px';
    this.canvas.style.height = h+'px';
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  /** @param {IScreen} s */
  push(s){ this.stack.push(s); s.init?.(); }
  /** @param {IScreen} s */
  replace(s){ const old = this.stack.pop(); old?.dispose?.(); this.stack.push(s); s.init?.(); }
  pop(){ const old = this.stack.pop(); old?.dispose?.(); }
  update(dt){ this.top()?.update?.(dt); }
  render(){ const ctx = this.ctx; if(!ctx) return; ctx.clearRect(0,0,this.canvas.width, this.canvas.height); this.top()?.render?.(ctx); }
  handleInput(evt){ return this.top()?.handleInput?.(evt); }
  top(){ return this.stack[this.stack.length-1]; }
}
