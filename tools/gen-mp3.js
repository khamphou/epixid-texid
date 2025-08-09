/*
  Génère deux fichiers MP3 procéduraux (chill.mp3, stress.mp3) dans assets/music.
  Pas d’échantillons externes: on synthétise des ondes simples (pads/arp) et on encode en MP3 via lamejs.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, '..', 'assets', 'music');

const SAMPLE_RATE = 44100;

function renderSeconds(seconds, fn){
  const len = Math.floor(seconds * SAMPLE_RATE);
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  for(let i=0;i<len;i++){
    const t = i / SAMPLE_RATE;
    const s = fn(t);
    left[i] = s[0];
    right[i] = s[1];
  }
  return { left, right };
}

function softLimit(x){ return Math.max(-1, Math.min(1, x)); }

function floatTo16PCM(f32){
  const i16 = new Int16Array(f32.length);
  for(let i=0;i<f32.length;i++){
    let s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return i16;
}

function writeWavStereo(stereo, wavPath){
  const left = floatTo16PCM(stereo.left);
  const right = floatTo16PCM(stereo.right);
  const numFrames = left.length;
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const buf = Buffer.alloc(headerSize + dataSize);
  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20);  // PCM format
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34); // bits per sample
  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  // interleave samples
  let o = headerSize;
  for(let i=0;i<numFrames;i++){
    buf.writeInt16LE(left[i], o); o+=2;
    buf.writeInt16LE(right[i], o); o+=2;
  }
  fs.writeFileSync(wavPath, buf);
}

function ffmpegEncode(wavPath, mp3Path){
  return new Promise((resolve, reject)=>{
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', wavPath, '-codec:a', 'libmp3lame', '-b:a', '160k', mp3Path];
    const p = spawn(ffmpegPath, args, { stdio: 'inherit' });
    p.on('close', (code)=>{ code===0 ? resolve() : reject(new Error('ffmpeg exit '+code)); });
  });
}

function makeChill(seconds=60){
  // pad simple: sin + 5th, filtre basse fréquence modulé
  const base = 220; // A3
  return renderSeconds(seconds, (t)=>{
    const lfo = 0.12 + 0.08*Math.sin(t*0.25*2*Math.PI);
    const a = 0.15 + 0.05*Math.sin(t*0.08*2*Math.PI);
    const s1 = Math.sin(2*Math.PI*base*t);
    const s5 = Math.sin(2*Math.PI*base*1.5*t);
    const pad = (s1*0.8 + s5*0.6) * (0.5 + 0.5*Math.sin(t*0.03*2*Math.PI));
    const slow = pad * lfo * a;
    return [softLimit(slow), softLimit(slow*0.98)];
  });
}

function makeStress(seconds=60){
  // arp tranchant + kick doux, montée progressive
  const scale = [0,3,5,7,10,12];
  const base = 164.81; // E3
  return renderSeconds(seconds, (t)=>{
    const beat = Math.floor(t*2); // 120bpm
    const idx = scale[beat % scale.length];
    const freq = base * Math.pow(2, idx/12);
    const arp = Math.sign(Math.sin(2*Math.PI*freq*t))*0.2; // carrée douce
    const hp = 0.2*Math.sin(2*Math.PI*50*t); // basse pulsée
    const rise = Math.min(1, t/45);
    const sig = (arp*0.7 + hp*0.4) * (0.2 + 0.8*rise);
    return [softLimit(sig), softLimit(sig*0.96)];
  });
}

function ensureDir(p){ fs.mkdirSync(p, { recursive:true }); }

async function main(){
  ensureDir(outDir);
  console.log('Génération chill.mp3 …');
  const wavChill = path.join(outDir, 'chill.wav');
  const mp3Chill = path.join(outDir, 'chill.mp3');
  writeWavStereo(makeChill(60), wavChill);
  await ffmpegEncode(wavChill, mp3Chill);
  fs.unlinkSync(wavChill);
  console.log('Génération stress.mp3 …');
  const wavStress = path.join(outDir, 'stress.wav');
  const mp3Stress = path.join(outDir, 'stress.mp3');
  writeWavStereo(makeStress(60), wavStress);
  await ffmpegEncode(wavStress, mp3Stress);
  fs.unlinkSync(wavStress);
  console.log('Terminé →', outDir);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
