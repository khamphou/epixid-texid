// ResourceManager: charge images/sons/fonts (stubs)

export class ResourceManager{
  constructor(){ this.cache = new Map(); }
  async preload(){ /* TODO: charger sprite/sons si nécessaire */ }
  async image(url){ if(this.cache.has(url)) return this.cache.get(url); const img = new Image(); img.src=url; await img.decode?.().catch(()=>{}); this.cache.set(url,img); return img; }
}
