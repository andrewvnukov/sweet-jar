'use strict';
// ============================================================
// sfx.js — процедурные звуки и лёгкий эмбиент-луп. Никаких аудиофайлов —
// весь звук синтезируется на лету движком ZzFXMicro (Frank Force, MIT/CC0,
// https://killedbyapixel.github.io/ZzFX/), портированным сюда без зависимости
// от LittleJS (в шаблоне используется ванильный Canvas2D).
// GAME: подбери частоты/тембр под тему игры — на сайте ZzFX Sound Designer
// жми Export -> "ZzFX Call Arguments" и вставляй массив в SFX ниже.
// ============================================================
const audioDefaultSampleRate = 44100;
let audioCtx = null, masterGain = null;
function ensureAudio(){
  if(audioCtx) return audioCtx;
  try{
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = .6;
    masterGain.connect(audioCtx.destination);
  }catch(e){}
  return audioCtx;
}
// разблокировка звука по первому касанию (автоплей-политики браузеров/WebView)
addEventListener("pointerdown", ()=>{ const ctx=ensureAudio(); if(ctx&&ctx.state!=="running") ctx.resume().catch(()=>{}); }, {once:true, passive:true});

const rand = (a=1,b=0) => b+(a-b)*Math.random();

// ---------- ZzFXMicro: генерация сэмплов по параметрам ----------
function zzfxG(volume=1, randomness=.05, frequency=220, attack=0, sustain=0, release=.1,
  shape=0, shapeCurve=1, slide=0, deltaSlide=0, pitchJump=0, pitchJumpTime=0, repeatTime=0,
  noise=0, modulation=0, bitCrush=0, delay=0, sustainVolume=1, decay=0, tremolo=0, filter=0){
  let sampleRate=audioDefaultSampleRate, PI2=Math.PI*2,
    startSlide=slide*=500*PI2/sampleRate/sampleRate,
    startFrequency=frequency*=(1+rand(randomness,-randomness))*PI2/sampleRate,
    modOffset=0, repeat=0, crush=0, jump=1, length, b=[], t=0, i=0, s=0, f,
    quality=2, w=PI2*Math.abs(filter)*2/sampleRate,
    cosw=Math.cos(w), alpha=Math.sin(w)/2/quality,
    a0=1+alpha, a1=-2*cosw/a0, a2=(1-alpha)/a0,
    b0=(1+Math.sign(filter)*cosw)/2/a0, b1=-(Math.sign(filter)+cosw)/a0, b2=b0,
    x2=0, x1=0, y2=0, y1=0;
  const minAttack=9;
  attack=attack*sampleRate||minAttack; decay*=sampleRate; sustain*=sampleRate; release*=sampleRate;
  delay*=sampleRate; deltaSlide*=500*PI2/sampleRate**3; modulation*=PI2/sampleRate;
  pitchJump*=PI2/sampleRate; pitchJumpTime*=sampleRate; repeatTime=repeatTime*sampleRate|0;
  for(length=attack+decay+sustain+release+delay|0; i<length; b[i++]=s*volume){
    if(!(++crush%(bitCrush*100|0))){
      s = shape? shape>1? shape>2? shape>3? shape>4?
          (t/PI2%1 < shapeCurve/2? 1:-1):
          Math.sin(t**3):
          Math.max(Math.min(Math.tan(t),1),-1):
          1-(2*t/PI2%2+2)%2:
          1-4*Math.abs(Math.round(t/PI2)-t/PI2):
          Math.sin(t);
      s = (repeatTime? 1-tremolo+tremolo*Math.sin(PI2*i/repeatTime) : 1) *
          (shape>4?s:Math.sign(s)*Math.abs(s)**shapeCurve) *
          (i<attack? i/attack :
           i<attack+decay? 1-((i-attack)/decay)*(1-sustainVolume) :
           i<attack+decay+sustain? sustainVolume :
           i<length-delay? (length-i-delay)/release*sustainVolume : 0);
      s = delay? s/2 + (delay>i? 0 : (i<length-delay? 1:(length-i)/delay) * b[i-delay|0]/2/volume) : s;
      if(filter) s = y1 = b2*x2 + b1*(x2=x1) + b0*(x1=s) - a2*y2 - a1*(y2=y1);
    }
    f=(frequency+=slide+=deltaSlide)*Math.cos(modulation*modOffset++);
    t+=f+f*noise*Math.sin(i**5);
    if(jump && ++jump>pitchJumpTime){ frequency+=pitchJump; startFrequency+=pitchJump; jump=0; }
    if(repeatTime && !(++repeat%repeatTime)){ frequency=startFrequency; slide=startSlide; jump=jump||1; }
  }
  return b;
}
function playBuffer(samples, volume=1, loop=false){
  const ctx=ensureAudio(); if(!ctx) return;
  const buf=ctx.createBuffer(1, samples.length, audioDefaultSampleRate);
  buf.getChannelData(0).set(samples);
  const src=ctx.createBufferSource(); src.buffer=buf; src.loop=loop;
  const g=ctx.createGain(); g.gain.value=volume;
  src.connect(g).connect(masterGain);
  src.start(0);
  return src;
}
function zzfx(...params){ return playBuffer(zzfxG(...params)); }

// ---------- Сладкая Банка: конфетные тапы, звонкое слияние, мягкая ошибка ----------
const SFX = {
  tap:  [.35,.05,340,.008,.02,.04,0,1.8,-4,0,0,0,0,0,0,0,0,.55,.01],
  coin: [.55,0,880,.01,.05,.14,0,1.9,0,0,420,.05,0,0,0,0,0,.7,.02],
  buy:  [.65,0,600,.01,.09,.18,0,1.6,0,0,180,.07,0,0,0,0,0,.8,.03],
  error:[.45,0,160,.02,.04,.1,1,.9,0,0,0,0,0,0,0,.08,0,.65,.03],
};
function sfx(name){ try{ zzfx(...SFX[name]); }catch(e){} }

// ---------- Сладкая Банка: лёгкий мажорный пэд (до-мажор, терция) под уют кондитерской ----------
let musicSrc=null;
function startMusic(){
  if(musicSrc) return;
  const ctx=ensureAudio(); if(!ctx) return;
  try{
    const a=zzfxG(.22,0,131,.9,4.2,4,0,1,0,0,0,0,0,0,0,0,.3,.9,1);   // до (низкий пэд)
    const b=zzfxG(.16,0,164.8,.9,4.2,4,0,1,0,0,0,0,0,0,0,0,.3,.85,1); // ми (терция сверху)
    const len=Math.max(a.length,b.length);
    const mix=new Float32Array(len);
    for(let i=0;i<len;i++) mix[i]=(a[i]||0)+(b[i]||0);
    musicSrc=playBuffer(mix, .32, true);
  }catch(e){}
}
function stopMusic(){ if(musicSrc){ try{ musicSrc.stop(); }catch(e){} musicSrc=null; } }

// ---------- Глушение звука (реклама, уход вкладки в фон) ----------
// Требование модерации: во время рекламы и при потере фокуса звука быть не должно.
// Глушим masterGain, а не останавливаем контекст — контекст остаётся живым,
// иначе после возврата первый звук приходит с задержкой (а в WebView может и не прийти).
let audioMuted = 0, audioLevel = .6;
function audioSuspend(){
  audioMuted++;
  if(audioMuted>1) return;
  try{
    if(!masterGain) return;
    audioLevel = masterGain.gain.value || audioLevel;
    if(masterGain.gain.setTargetAtTime && audioCtx) masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, .02);
    else masterGain.gain.value = 0;
  }catch(e){}
}
function audioResume(){
  audioMuted = Math.max(0, audioMuted-1);
  if(audioMuted>0) return;
  try{
    if(!masterGain) return;
    if(audioCtx && audioCtx.state!=="running") audioCtx.resume().catch(()=>{});
    if(masterGain.gain.setTargetAtTime && audioCtx) masterGain.gain.setTargetAtTime(audioLevel, audioCtx.currentTime, .02);
    else masterGain.gain.value = audioLevel;
  }catch(e){}
}
// тест-хук: заглушён ли звук прямо сейчас
window.__audioMuted = () => audioMuted>0;
