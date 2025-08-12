// Charge et valide les YAML de modes
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import modeConfigSchema from '../../../shared/modes/schema.js';

const registry = new Map();

export function loadAll(dir){
  const base = dir || path.resolve(process.cwd(), 'shared/modes');
  const files = fs.readdirSync(base).filter(f=>f.endsWith('.yml'));
  for(const f of files){
    const raw = fs.readFileSync(path.join(base,f), 'utf8');
    const cfg = yaml.load(raw);
    try{
      const parsed = modeConfigSchema.parse(cfg);
      registry.set(parsed.id, parsed);
    } catch(err){
      const msg = (err?.errors||err?.message||err)?.toString?.() || 'invalid_config';
      console.error('[modes] invalid', f, msg);
    }
  }
}
export function getModeConfig(id){ return registry.get(id); }
export function getAllModeIds(){ return Array.from(registry.keys()); }
