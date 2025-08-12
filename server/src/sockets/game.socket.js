// Socket handlers (squelette)
import { getModeConfig } from '../modes/loader.js';

export function attachGameSocket(io){
  io.on('connection', (socket)=>{
    socket.on('start_match', ({ modeId })=>{
      const cfg = getModeConfig(modeId);
      if(!cfg){ socket.emit('error', { type:'mode_not_found' }); return; }
      io.emit('match_start', { type:'match_start', modeId, cfg });
    });
  });
}
