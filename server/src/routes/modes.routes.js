import express from 'express';
import { getModeConfig, getAllModeIds } from '../modes/loader.js';
import modeConfigSchema from '../../../shared/modes/schema.js';

export const modesRouter = express.Router();

modesRouter.get('/modes/:id', (req,res)=>{
  const id = req.params.id;
  const cfg = getModeConfig(id);
  if(!cfg) return res.status(404).json({ error:'mode_not_found' });
  // TODO: épurer champs non nécessaires
  res.json(cfg);
});

// Liste des IDs
modesRouter.get('/modes', (_req,res)=>{
  res.json({ ids: getAllModeIds() });
});

// Endpoint de validation à la demande (utile en dev/outils)
modesRouter.post('/modes/validate', (req,res)=>{
  try{
    const result = modeConfigSchema.parse(req.body);
    res.json({ ok:true, id: result.id });
  }catch(err){
    res.status(400).json({ ok:false, error: 'invalid_config', details: err?.errors ?? err?.message ?? String(err) });
  }
});
