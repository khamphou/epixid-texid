// Transforme une config YAML en règles exécutables

export const modeFactory = {
  /** @param {any} cfg */
  fromConfig(cfg){
    const rules = buildRules(cfg);
    const objectives = buildObjectives(cfg);
    const meta = { id: cfg.id, title: cfg.title, description: cfg.description, version: cfg.version };
    return { rules, objectives, meta };
  }
};

function buildRules(cfg){
  const at = cfg.rules?.attackTable||{};
  const comboTable = at.comboTable||[];
  const b2bBonus = at.backToBackBonus||0;
  const tspin = at.tspin||{};
  return {
    attackFor(ev){
      // ev:{ lines, tspinVariant, b2b, combo }
      const { lines=0, tspinVariant=null, b2b=false, combo=0 } = ev||{};
      let send = 0;
      if(tspinVariant){ send = (tspin[tspinVariant]||0); }
      else if(lines===1) send = at.single||0;
      else if(lines===2) send = at.double||0;
      else if(lines===3) send = at.triple||0;
      else if(lines===4) send = at.tetris||0;
      if(b2b && (lines===4 || tspinVariant)) send += b2bBonus;
      if(combo>0) send += (comboTable[Math.min(combo, comboTable.length-1)]||0);
      return send;
    },
    inputs: cfg.rules?.inputs||{},
    speed: cfg.rules?.speed||{},
    garbage: cfg.rules?.garbage||{},
  };
}

function buildObjectives(cfg){
  const state = { kos:0, lines:0, time:0, combos:0, tspins:0 };
  const win = cfg.objectives?.winCondition||'score_after_time';
  return {
    reset(){ state.kos=0; state.lines=0; state.time=0; state.combos=0; state.tspins=0; },
    tick(dt){ state.time += dt; },
    onClear(ev){ state.lines += ev.lines||0; if(ev.combo>=5) state.combos++; if(ev.tspin) state.tspins++; },
    onKO(){ state.kos++; },
    check(){
      if(win==='last_standing') return false; // géré côté serveur en multi
      if(win==='first_to_objectives'){
        const tgt = cfg.objectives?.targets||{};
        if(tgt.survive && state.time >= (tgt.survive.seconds||0)) return true;
        if(tgt.lines_cleared && state.lines >= (tgt.lines_cleared.count||0)) return true;
        if(tgt.combos && state.combos >= (tgt.combos.occurrences||0)) return true;
        if(tgt.tspins && state.tspins >= (tgt.tspins.count||0)) return true;
        return false;
      }
      // score_after_time: laisser le score décider; ici pas de fin anticipée
      return false;
    }
  };
}
