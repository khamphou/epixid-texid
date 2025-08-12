// UI commune: toasts/modals/panels (stubs)

export class UI{
  constructor(doc){ this.doc = doc; }
  toast(msg){ console.log('[toast]', msg); /* TODO: impl visuelle */ }
  confirm(msg){ return Promise.resolve(window.confirm(msg)); }
  modal(id){ /* TODO */ }
}
