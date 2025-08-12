// 7-bag RNG
export class Bag{
  constructor(rng=Math.random){ this.rng=rng; this.bag=[]; }
  next(){ if(this.bag.length===0){ this.bag=['I','J','L','O','S','T','Z']; for(let i=this.bag.length-1;i>0;i--){ const j=(this.rng()*(i+1))|0; [this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]]; } } return this.bag.pop(); }
}
