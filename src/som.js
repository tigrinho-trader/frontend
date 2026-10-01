// Efeitos sonoros sintetizados com WebAudio (sem arquivos). O navegador so libera o audio depois de um clique,
// entao o contexto nasce no primeiro som tocado.

let contexto = null;
let mudo = false;
try {
  mudo = localStorage.getItem("tigrinho.mudo") === "1";
} catch {
  // sem armazenamento: comeca com som
}

export function estaMudo() {
  return mudo;
}

export function alternarMudo() {
  mudo = !mudo;
  try {
    localStorage.setItem("tigrinho.mudo", mudo ? "1" : "0");
  } catch {
    // vale so nesta aba
  }
  return mudo;
}

function audio() {
  if (mudo || typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!contexto) contexto = new Ctx();
  if (contexto.state === "suspended") contexto.resume();
  return contexto;
}

function nota(ctx, { freq, inicio = 0, duracao = 0.15, tipo = "sine", volume = 0.2, ate = null }) {
  const t = ctx.currentTime + inicio;
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, t);
  if (ate) osc.frequency.exponentialRampToValueAtTime(ate, t + duracao);
  ganho.gain.setValueAtTime(0.0001, t);
  ganho.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  osc.connect(ganho).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duracao + 0.02);
}

function ruido(ctx, { inicio = 0, duracao = 0.4, volume = 0.3, filtro = 1200 }) {
  const t = ctx.currentTime + inicio;
  const amostras = Math.floor(ctx.sampleRate * duracao);
  const buffer = ctx.createBuffer(1, amostras, ctx.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < amostras; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / amostras);
  const fonte = ctx.createBufferSource();
  fonte.buffer = buffer;
  const passaBaixa = ctx.createBiquadFilter();
  passaBaixa.type = "lowpass";
  passaBaixa.frequency.value = filtro;
  const ganho = ctx.createGain();
  ganho.gain.value = volume;
  fonte.connect(passaBaixa).connect(ganho).connect(ctx.destination);
  fonte.start(t);
}

const EFEITOS = {
  clique: (ctx) => nota(ctx, { freq: 660, duracao: 0.06, tipo: "triangle", volume: 0.12 }),
  decolar: (ctx) => {
    nota(ctx, { freq: 180, ate: 520, duracao: 0.6, tipo: "sawtooth", volume: 0.06 });
    ruido(ctx, { duracao: 0.6, volume: 0.12, filtro: 900 });
  },
  congelar: (ctx) => {
    [1568, 2093, 2637, 3136].forEach((f, i) => nota(ctx, { freq: f, inicio: i * 0.05, duracao: 0.25, volume: 0.08 }));
    ruido(ctx, { duracao: 0.35, volume: 0.1, filtro: 6000 });
  },
  tique: (ctx) => nota(ctx, { freq: 1200, duracao: 0.03, tipo: "square", volume: 0.04 }),
  impacto: (ctx) => {
    ruido(ctx, { duracao: 0.7, volume: 0.45, filtro: 700 });
    nota(ctx, { freq: 140, ate: 40, duracao: 0.5, tipo: "sawtooth", volume: 0.15 });
  },
  vitoria: (ctx) =>
    [523, 659, 784, 1047].forEach((f, i) =>
      nota(ctx, { freq: f, inicio: i * 0.09, duracao: 0.22, tipo: "triangle", volume: 0.16 }),
    ),
  moeda: (ctx) => {
    nota(ctx, { freq: 988, duracao: 0.08, tipo: "square", volume: 0.07 });
    nota(ctx, { freq: 1319, inicio: 0.07, duracao: 0.18, tipo: "square", volume: 0.07 });
  },
  rugido: (ctx) => {
    nota(ctx, { freq: 110, ate: 70, duracao: 0.7, tipo: "sawtooth", volume: 0.12 });
    ruido(ctx, { duracao: 0.7, volume: 0.15, filtro: 500 });
  },
  golpe: (ctx) => {
    ruido(ctx, { duracao: 0.15, volume: 0.35, filtro: 2500 });
    nota(ctx, { freq: 220, ate: 90, duracao: 0.15, tipo: "square", volume: 0.1 });
  },
  derrota: (ctx) =>
    [392, 330, 262].forEach((f, i) =>
      nota(ctx, { freq: f, inicio: i * 0.14, duracao: 0.3, tipo: "triangle", volume: 0.14 }),
    ),
};

export function tocar(nome) {
  const ctx = audio();
  if (!ctx || !EFEITOS[nome]) return;
  try {
    EFEITOS[nome](ctx);
  } catch {
    // audio e enfeite: nunca derruba o jogo
  }
}
