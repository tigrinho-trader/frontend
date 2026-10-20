// Flecha Certeira: o jogo (canvas, controles, telas e HUD).
// As regras e a economia ficam em regras.js; os cenários em cenarios.js.
// O dinheiro fica no servidor: saldo na carteira (wallet-service) e cada rodada é uma
// sessão no trading-service (sessao.js); o navegador só estima entre as respostas.
import {
  DEFAULT_ARROWS, MAX_ARROWS, REFILL_QTY, BIRD_TYPES, RANGES, ARROW_TYPES, ARROW_BY_ID,
  APOSTA_MERCADO,
  clamp, formatMult, arrowCost, coinsForHit, emptyQuiver, countArrows, orderCost, minCost,
  canEnter as canEnterWith, isBroke as isBrokeWith, fitOrder, changeOrder, pickBirdType, tiposNoCampo,
  segmentHitsCircle, arrowPosition,
} from './regras.js';
import { Scenery } from './cenarios.js';
import * as api from './api.js';
import { criarControladorSessao } from './sessao.js';
import { formatarMoedas, mensagemErro } from './telas.js';
import {
  ATIVOS, BTC_MAX_VOANDO, BTC_ALTURA, FLECHA_BTC, LISTA_ATIVOS, acertaBinario, acertaNoAlvo, alturaBtc,
  alvoBinario, alvoFlechaBtc, contarNoPlacar, criarFeedPreco, direcaoDaPrevisao, linhasDoPlacar, placarVazio,
  lucroDaAposta, moedasComSinal, precoPrevisto, reaisComSinal, somarResultadoReais, textoResultadoEstudo,
  toleranciaEmDolares, velocidadeFlechaBtc, velocidadePassaroDaFlecha,
} from './bitcoin.js';

// ---------------------------------------------------------------------------
// Configuração geral
// ---------------------------------------------------------------------------
// Resolução lógica: a altura é fixa (720) e a largura acompanha a proporção da tela, de 1280 (16:9) até a largura
// do cenário (1920): telas largas e celulares deitados ficam sem faixas nas laterais.
const H = 720, W_MIN = 1280;
let W = W_MIN;
const GROUND_Y = 640;             // altura do chão
const G = 900;                    // gravidade (px/s²)
const MIN_SPEED = 300, MAX_SPEED = 1350;
const MAX_DRAG = 230;             // distância de arraste para força máxima
const ARROW_LEN = 62;
const LAUNCH = { x: 180, y: 518 }; // ponto de onde a flecha sai (o arco)
const PREVIEW_STEP = 0.05;        // segundos entre pontos da trajetória

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
const rand = (a, b) => a + Math.random() * (b - a);
const $ = id => document.getElementById(id);
const moedas = formatarMoedas;

// ---------------------------------------------------------------------------
// Som (sintetizado com WebAudio, sem arquivos)
// ---------------------------------------------------------------------------
let actx = null, muted = false;

function audio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}

function tone(freq, freqEnd, dur, type = 'sine', vol = 0.2, delay = 0) {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator(), gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const sfx = {
  shoot() { tone(520, 140, 0.14, 'triangle', 0.18); },
  hit() { tone(700, 1200, 0.08, 'square', 0.07); tone(180, 60, 0.18, 'sine', 0.25); },
  combo() { [660, 880, 1100].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.12, i * 0.07)); },
  thud() { tone(140, 50, 0.1, 'sine', 0.12); },
  coin() { tone(988, 988, 0.07, 'square', 0.05); tone(1319, 1319, 0.16, 'square', 0.05, 0.07); },
  pay() { tone(330, 220, 0.12, 'triangle', 0.12); tone(1319, 1319, 0.08, 'square', 0.04, 0.05); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.15, i * 0.12)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, f * 0.95, 0.25, 'triangle', 0.15, i * 0.18)); },
};

// ---------------------------------------------------------------------------
// Canvas e escala
// ---------------------------------------------------------------------------
const canvas = $('game');
const ctx = canvas.getContext('2d');
const wrap = $('wrap');

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.round(Math.min(Scenery.larguraMaxima, Math.max(W_MIN, H * window.innerWidth / window.innerHeight)));
  Scenery.ajustarLargura(W);
  FLECHA_BTC.xAlvo = W - 90;          // o alvo das flechas de mercado fica sempre perto da borda direita
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
  wrap.style.width = cw + 'px';
  wrap.style.height = ch + 'px';
  wrap.style.setProperty('--s', scale);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  canvas.width = Math.floor(cw * dpr);
  canvas.height = Math.floor(ch * dpr);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Estado do jogo
// ---------------------------------------------------------------------------
const game = {
  state: 'menu',            // menu | ranges | buy | playing | refill | paused | result | perfil | admin | bloqueado
  wallet: 0,                // saldo mostrado: carteira do servidor (na rodada: saldoBase − custo + ganhos)
  saldoBase: 0,             // saldo da carteira quando a rodada começou
  encerrando: false,        // esperando o servidor encerrar a sessão
  ocupado: false,           // esperando o servidor abrir a sessão ou vender flechas
  range: RANGES[0],
  quiver: emptyQuiver(),    // flechas restantes de cada tipo
  selected: 'wood',         // tipo de flecha na mão do arqueiro
  shotsFired: 0,
  totalShots: 0,            // tiros em todas as rodadas (para a dica do primeiro tiro)
  hits: 0,
  earned: 0,                // moedas ganhas na rodada atual
  spent: 0,                 // entrada + flechas compradas na rodada atual
  bought: emptyQuiver(),    // flechas compradas na rodada, por tipo
  order: { ...emptyQuiver(), wood: DEFAULT_ARROWS },   // escolha na loja
  birds: [],
  arrows: [],
  particles: [],
  texts: [],
  spawnTimer: 0,
  mercadoTimers: {},        // por ativo: segundos até o próximo pássaro de mercado avulso
  estudo: null,             // último resultado do estudo mostrado no HUD: { texto, detalhe, cor }
  guardadas: null,          // flechas guardadas do jogador (GET /jogos/flecha/aljava): { campos, mercado }
  placarPartida: placarVazio(),   // acertos nas apostas de mercado desta partida, por ativo
  reaisPartida: 0,          // soma, em reais, do resultado das operações feitas com as apostas desta partida
  apostasPartida: 0,        // moedas que as apostas desta partida renderam (pago pelo servidor − 100 de cada)
  passarosComuns: lerPassarosComuns(),   // false: só os pássaros de criptomoeda aparecem na rodada
  pending: null,            // 'win' | 'lose' enquanto espera a animação terminar
  endTimer: 0,
  banner: 0,
  shake: 0,
  time: 0,
  aim: { active: false, valid: false, sx: 0, sy: 0, cx: 0, cy: 0, angle: -0.6, power: 0 },
};

const OVERLAYS = {
  menu: 'menu', ranges: 'ranges', buy: 'buy', refill: 'refill', paused: 'pause', result: 'result',
  perfil: 'perfil', admin: 'admin', bloqueado: 'bloqueado', creditos: 'creditos', saldo: 'saldo', saque: 'saque',
};

export function setState(s) {
  game.state = s;
  wrap.dataset.state = s;
  for (const [state, id] of Object.entries(OVERLAYS)) {
    $(id).classList.toggle('show', state === s);
  }
  if (s === 'menu') $('menu-wallet').textContent = moedas(game.wallet);
  if (s === 'ranges') renderRanges();
}

export const estadoAtual = () => game.state;
export const saldoAtual = () => game.wallet;

/** Volta para a tela de onde o jogador foi comprar moedas, já com o saldo novo. */
export function voltarDaCompra(estado) {
  if (estado === 'buy') {
    mostrarErroCompra(null);
    setState('buy');
    renderBuy();
  } else {
    setState(estado);
  }
}

/** Atualiza o saldo em todas as telas que o mostram. */
function mostrarSaldo() {
  for (const id of ['menu-wallet', 'ranges-wallet', 'res-wallet']) $(id).textContent = moedas(game.wallet);
  if (game.state === 'ranges') renderRanges();
  if (game.state === 'result') atualizarFalido();
}

function setWallet(v) {
  game.wallet = Math.max(0, Number(v) || 0);
  mostrarSaldo();
}

/**
 * Busca o saldo na carteira (GET /api/carteira). Durante uma rodada o saldo mostrado
 * continua sendo o da rodada. `aceitar(saldo)` pode recusar um saldo antigo.
 */
export async function atualizarCarteira({ aceitar = () => true } = {}) {
  const c = await api.carteira();
  const saldo = Number(c?.saldo) || 0;
  if (!sessaoCtl && aceitar(saldo)) setWallet(saldo);
  return saldo;
}

// Aviso rápido no topo da tela (não bloqueia o jogo)
let avisoTimer = null;
export function avisar(texto, tipo = 'info', duracao = 4500) {
  const el = $('aviso');
  el.textContent = texto;
  el.className = `aviso show ${tipo}`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.className = 'aviso'; }, duracao);
}

// Erros que já têm tela própria (401 volta ao login, 403 mostra a conta bloqueada)
const tratadoPeloApp = erro => erro?.status === 401 || erro?.status === 403;

// ---------------------------------------------------------------------------
// Sessão no servidor
// ---------------------------------------------------------------------------
let sessaoCtl = null;

function novaSessao() {
  return criarControladorSessao({
    api,
    aoAtualizar: () => reconciliar(),
    aoErro: (erro, ctx) => {
      if (tratadoPeloApp(erro)) return;
      if (ctx.tipo === 'tiro' && (erro.status === 404 || erro.status === 409)) {
        avisar('A rodada já foi encerrada no servidor.', 'erro');
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'refill') endSession();
        return;
      }
      avisar(`Tiro não registrado: ${mensagemErro(erro)}`, 'erro');
    },
  });
}

// Flechas que já saíram do arco mas ainda não foram informadas ao servidor
const naoReportadas = () => game.arrows.filter(a => !a.reportado);

/** Ajusta o HUD aos números do servidor (mais as estimativas do que ainda não foi confirmado). */
function reconciliar() {
  const est = sessaoCtl?.estado();
  if (!est) return;
  const voando = naoReportadas();
  game.spent = est.custo;
  game.earned = est.ganhos + voando.reduce((s, a) => s + a.coins, 0);
  for (const t of ARROW_TYPES) {
    const noAr = voando.filter(a => a.type.id === t.id).length;
    game.quiver[t.id] = Math.max(0, (est.flechas[t.id] || 0) - noAr);
  }
  for (const t of ARROW_TYPES) game.bought[t.id] = Number(est.compradas[t.id]) || 0;
  ensureSelection();
  game.wallet = game.saldoBase - game.spent + game.earned;
  if (game.state === 'refill') fillRefill();
}

/** Informa ao servidor uma flecha que terminou o voo (cravou no chão ou saiu da tela). */
function reportarTiro(ar) {
  // flecha de mercado: a aposta já foi registrada no disparo e quem paga é o servidor
  if (ar.reportado || !sessaoCtl || ar.type.mercado) return;
  ar.reportado = true;
  sessaoCtl.registrarTiro(ar.type.id, ar.acertos, ar.coins);
}

// Atalhos que usam o saldo atual
const canEnter = range => canEnterWith(game.wallet, range);
const isBroke = () => isBrokeWith(game.wallet);
const arrowsLeft = () => countArrows(game.quiver);

function renderRanges() {
  $('ranges-wallet').textContent = moedas(game.wallet);
  const grid = $('range-grid');
  grid.innerHTML = '';
  RANGES.forEach((r, i) => {
    const ok = canEnter(r);
    const card = document.createElement('div');
    card.className = 'range' + (ok ? '' : ' locked');
    const pips = '➶'.repeat(r.tier) + `<span class="off">${'➶'.repeat(4 - r.tier)}</span>`;
    const criptos = r.ativos.map(id => `<b style="color:${ATIVOS[id].cor}">${ATIVOS[id].marca}</b> ${ATIVOS[id].nome}`).join(', ');
    card.innerHTML = `
      <span class="tier" title="Dificuldade">${pips}</span>
      <h3>${r.name}</h3>
      <p>${r.desc}</p>
      <p>Entrada <b><span class="coin"></span>${r.fee}</b> · flechas de madeira <b>grátis</b> para treinar</p>
      <p>Cripto: ${criptos} · aposta de <b><span class="coin"></span>${APOSTA_MERCADO}</b></p>
      <button class="btn" data-range="${i}" ${ok ? '' : 'disabled'}>
        ${ok ? 'Escolher' : `Precisa de ${minCost(r)}`}
      </button>`;
    grid.appendChild(card);
  });
}

// Ícone de cada flecha para as telas em HTML (desenhado com o mesmo código do jogo)
const ARROW_ICONS = {};
function arrowIcon(type) {
  if (!ARROW_ICONS[type.id]) {
    const c = document.createElement('canvas');
    c.width = 180;
    c.height = 60;
    const x = c.getContext('2d');
    x.scale(2, 2);
    x.translate(82, 15);
    x.rotate(-0.25);
    drawArrowShape(type, x);
    ARROW_ICONS[type.id] = c.toDataURL();
  }
  return ARROW_ICONS[type.id];
}

/** Flechas guardadas que o jogador leva para este campo: as comuns compradas nele e as de mercado. */
function guardadasNoCampo(range = game.range) {
  const g = game.guardadas;
  const campo = g?.campos?.[range.slug] || {};
  return Object.fromEntries(ARROW_TYPES.map(t => [t.id, Number((t.mercado ? g?.mercado?.[t.id] : campo[t.id]) || 0)]));
}

async function carregarGuardadas() {
  try {
    game.guardadas = await api.aljavaGuardada();
  } catch { /* sem a aljava guardada: a loja segue só com a compra */ }
}

function openBuy(range) {
  if (!canEnter(range)) return;
  game.range = range;
  // Se o pedido anterior ficou caro demais, corta das flechas mais caras primeiro
  game.order = fitOrder(game.order, range, game.wallet, countArrows(guardadasNoCampo(range)));
  mostrarErroCompra(null);
  setState('buy');
  renderBuy();
  carregarGuardadas().then(() => {
    if (game.state !== 'buy' || game.range !== range) return;
    const nGuardadas = countArrows(guardadasNoCampo(range));
    // já tem flechas guardadas aqui: não sugere comprar as 10 de madeira de sempre
    if (nGuardadas > 0 && countArrows(game.order) === DEFAULT_ARROWS && game.order.wood === DEFAULT_ARROWS) {
      game.order = emptyQuiver();
    }
    game.order = fitOrder(game.order, range, game.wallet, nGuardadas);
    renderBuy();
  });
}

// Erro do servidor ao abrir a sessão (saldo insuficiente, rodada já aberta, sem conexão...)
function mostrarErroCompra(erro) {
  const el = $('buy-erro');
  el.hidden = !erro;
  $('btn-buy-fechar-aberta').hidden = erro?.status !== 409;
  $('btn-buy-comprar').hidden = !(erro?.status === 422 && /saldo insuficiente/i.test(erro?.mensagem || ''));
  $('buy-erro-texto').textContent = erro
    ? (erro.status === 409 ? 'Você já tem uma rodada aberta no servidor. Encerre-a para começar outra.' : mensagemErro(erro))
    : '';
}

/** Encerra a sessão que ficou aberta no servidor (ex.: outra aba) e libera a loja. */
async function encerrarRodadaAberta() {
  const btn = $('btn-buy-fechar-aberta');
  btn.disabled = true;
  try {
    const aberta = await api.sessaoAtual();
    if (aberta) await api.encerrarSessao(aberta.id);
    mostrarErroCompra(null);
    avisar('A rodada anterior foi encerrada e acertada na carteira.');
    await atualizarCarteira().catch(() => {});
    setTimeout(() => atualizarCarteira().catch(() => {}), 1500);
  } catch (e) {
    if (!tratadoPeloApp(e)) mostrarErroCompra(e);
  } finally {
    btn.disabled = false;
    if (game.state === 'buy') renderBuy();
  }
}

function renderBuy() {
  const r = game.range, order = game.order;
  const arrowsCost = orderCost(order, r), total = r.fee + arrowsCost, count = countArrows(order);
  const guard = guardadasNoCampo(r), nGuard = countArrows(guard);
  const left = game.wallet - total;
  $('buy-title').textContent = r.name;

  $('arrow-shop').innerHTML = tiposNoCampo(r).map(t => {
    const cost = arrowCost(t, r), n = order[t.id];
    const canAdd = left >= cost && count + nGuard < MAX_ARROWS;
    const ganho = t.mercado
      ? `volta <b class="mult">${APOSTA_MERCADO}</b> + resultado da operação`
      : 'grátis · treino';
    const tem = guard[t.id] ? ` · <b class="guardadas">+${guard[t.id]} guardada${guard[t.id] === 1 ? '' : 's'}</b>` : '';
    return `
      <div class="arrow-row${n ? ' active' : ''}" title="${t.desc}">
        <img src="${arrowIcon(t)}" alt="">
        <div class="arrow-info">
          <b class="arrow-name">${t.name}</b>
          <span>${ganho} · <span class="coin"></span>${cost} cada${tem}</span>
        </div>
        <div class="arrow-qty">
          <button class="chip" data-type="${t.id}" data-d="-5" ${n ? '' : 'disabled'}>−5</button>
          <button class="step sm" data-type="${t.id}" data-d="-1" ${n ? '' : 'disabled'}>−</button>
          <span class="n">${n}</span>
          <button class="step sm" data-type="${t.id}" data-d="1" ${canAdd ? '' : 'disabled'}>+</button>
          <button class="chip" data-type="${t.id}" data-d="5" ${canAdd ? '' : 'disabled'}>+5</button>
        </div>
      </div>`;
  }).join('');

  $('buy-fee').textContent = r.fee;
  $('buy-arrows-label').textContent = `${count} flecha${count === 1 ? '' : 's'}${nGuard ? ` (+${nGuard} guardada${nGuard === 1 ? '' : 's'})` : ''}`;
  $('buy-arrows').textContent = arrowsCost;
  $('buy-total').textContent = total;
  $('buy-after').textContent = moedas(left);
  $('btn-enter').disabled = count + nGuard === 0 || left < 0 || game.ocupado;
  $('btn-enter').textContent = game.ocupado ? 'Entrando...' : 'Pagar e entrar';
}

function updateOrder(typeId, delta) {
  game.order = changeOrder(game.order, game.range, game.wallet, typeId, delta, countArrows(guardadasNoCampo()));
  renderBuy();
}

function selectArrow(id) {
  if (game.quiver[id] > 0) game.selected = id;
  if (ARROW_BY_ID[game.selected]?.mercado) avisarEstudo();
}

/** Na primeira vez que o jogador pega a flecha bitcoin, explica o estudo (uma vez por navegador). */
function avisarEstudo() {
  try {
    if (localStorage.getItem('flecha-estudo-aviso')) return;
    localStorage.setItem('flecha-estudo-aviso', '1');
  } catch { /* sem armazenamento: avisa toda vez */ }
  avisar('Estudo: cada flecha de mercado (bitcoin, ethereum, ouro) vira uma operação na direção que você previu '
    + '(alta ou queda), com o dinheiro do criador do jogo, não o seu. Quando a flecha chega, você vê se ela ganhou '
    + 'ou perdeu.',
  'info', 12000);
}

// Se a flecha escolhida acabou, pega a próxima que ainda tiver
function ensureSelection() {
  if (game.quiver[game.selected] > 0) return;
  const next = tiposNoCampo(game.range).find(t => game.quiver[t.id] > 0);
  if (next) game.selected = next.id;
}

async function enterRange() {
  const range = game.range, order = game.order;
  const total = range.fee + orderCost(order, range);
  if (total > game.wallet || countArrows(order) + countArrows(guardadasNoCampo(range)) === 0
    || game.ocupado || sessaoCtl) return;
  audio();

  // Abre a sessão no servidor: ele confere o saldo e guarda o custo da rodada
  const ctl = novaSessao();
  game.ocupado = true;
  mostrarErroCompra(null);
  renderBuy();
  try {
    await ctl.abrir(range.slug, { ...order });
  } catch (e) {
    if (!tratadoPeloApp(e)) mostrarErroCompra(e);
    return;
  } finally {
    game.ocupado = false;
    if (game.state === 'buy') renderBuy();
  }
  if (game.state !== 'buy') return;   // saiu da loja (ex.: sessão expirou) enquanto esperava

  sessaoCtl = ctl;
  game.guardadas = null;    // as guardadas entraram na aljava da rodada (o servidor manda as flechas)
  game.saldoBase = game.wallet;
  sfx.pay();
  game.spent = total;
  game.quiver = { ...order };
  game.bought = { ...order };
  game.selected = 'wood';
  ensureSelection();
  game.shotsFired = 0;
  game.hits = 0;
  game.earned = 0;
  game.birds = [];
  game.arrows = [];
  game.particles = [];
  game.texts = [];
  game.spawnTimer = 0.2;
  // bitcoin logo; ethereum e ouro escalonados para não nascerem juntos
  game.mercadoTimers = { btc: 1, eth: 2.5, ouro: 4 };
  game.estudo = null;
  game.placarPartida = placarVazio();
  game.reaisPartida = 0;
  game.apostasPartida = 0;
  game.pending = null;
  game.endTimer = 0;
  game.banner = 2.6;
  game.aim.active = false;
  reconciliar();
  setState('playing');
}

/** Resultado da rodada para o jogador: a entrada mais o que as apostas renderam (pago − 100 de cada). */
const resultadoDaRodada = () => Math.round((game.apostasPartida - (game.range?.fee || 0)) * 100) / 100;

// O servidor só deixa comprar com o saldo da carteira menos o custo da rodada:
// as moedas ganhas entram na carteira quando a rodada termina.
const availableToBuy = () => game.saldoBase - game.spent;
const canRefill = () => availableToBuy() >= REFILL_QTY * game.range.arrowPrice;

function fillRefill() {
  const r = game.range, net = resultadoDaRodada(), livre = availableToBuy();
  $('ref-spent').textContent = `−${moedas(r.fee)}`;
  $('ref-earned').textContent = moedasComSinal(game.apostasPartida);
  const netEl = $('ref-net');
  netEl.textContent = moedasComSinal(net);
  netEl.className = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
  $('ref-wallet').textContent = moedas(livre);
  $('refill-options').innerHTML = tiposNoCampo(r).map(t => {
    const cost = REFILL_QTY * arrowCost(t, r);
    const ok = livre >= cost && arrowsLeft() + REFILL_QTY <= MAX_ARROWS && !game.ocupado && !game.encerrando;
    return `
      <button class="refill-opt" data-type="${t.id}" ${ok ? '' : 'disabled'}>
        <img src="${arrowIcon(t)}" alt="">
        <b>+${REFILL_QTY} ${t.name}</b>
        <span>${t.mercado ? `volta ${APOSTA_MERCADO} + resultado` : 'treino'} · <span class="coin"></span>${cost}</span>
      </button>`;
  }).join('');
}

function openRefill() {
  $('refill-erro').textContent = '';
  fillRefill();
  game.aim.active = false;
  setState('refill');
}

async function buyMoreArrows(typeId) {
  const cost = REFILL_QTY * arrowCost(ARROW_BY_ID[typeId], game.range);
  if (cost > availableToBuy() || game.ocupado || game.encerrando || !sessaoCtl) return;
  game.ocupado = true;
  $('refill-erro').textContent = '';
  fillRefill();
  try {
    await sessaoCtl.comprar(typeId, REFILL_QTY);   // o servidor desconta e devolve a aljava nova
  } catch (e) {
    if (!tratadoPeloApp(e)) $('refill-erro').textContent = mensagemErro(e);
    return;
  } finally {
    game.ocupado = false;
    if (game.state === 'refill') fillRefill();
  }
  if (game.state !== 'refill') return;
  reconciliar();
  if (game.quiver[typeId] > 0) game.selected = typeId;
  game.pending = null;
  sfx.pay();
  setState('playing');
}

// Botões de saída ficam travados enquanto o servidor encerra a sessão
function marcarEncerrando(on) {
  game.encerrando = on;
  for (const id of ['btn-quit', 'btn-resume', 'btn-refill-end']) $(id).disabled = on;
  $('btn-quit').textContent = on ? 'Encerrando...' : 'Sair do campo';
  $('btn-refill-end').textContent = on ? 'Encerrando...' : 'Encerrar rodada';
  if (game.state === 'refill') fillRefill();
}

async function endSession() {
  if (game.encerrando || !sessaoCtl) return;
  game.aim.active = false;
  game.pending = null;
  // Flechas ainda no ar contam com os pássaros que já acertaram
  for (const ar of game.arrows) reportarTiro(ar);
  marcarEncerrando(true);

  const ctl = sessaoCtl;
  let final = null, falha = null;
  try {
    final = await ctl.encerrar();
  } catch (e) {
    falha = e;
  }
  marcarEncerrando(false);
  if (falha && tratadoPeloApp(falha)) { sessaoCtl = null; return; }

  // Resultado oficial do servidor (ou a estimativa local, se ele não respondeu)
  const custo = final ? Number(final.custo) || 0 : game.spent;
  const ganhos = final ? Number(final.ganhos) || 0 : game.earned;
  // o que muda na carteira (as flechas compradas e não usadas ficam guardadas, já pagas)
  const netCarteira = final ? Number(final.resultado) || 0 : ganhos - custo;
  // o que o jogador ganhou ou perdeu na rodada: entrada + apostas
  const net = resultadoDaRodada();
  const compradas = final?.compradas || game.bought;
  const sobraram = final?.flechas || game.quiver;
  const disparadas = final?.disparadas
    ? ARROW_TYPES.reduce((s, t) => s + (Number(final.disparadas[t.id]) || 0), 0)
    : game.shotsFired;
  const acertos = final ? Number(final.acertos) || 0 : game.hits;
  sessaoCtl = null;
  const saldoBase = game.saldoBase;
  game.wallet = Math.max(0, saldoBase + netCarteira);

  const title = $('res-title');
  title.textContent = net > 0 ? 'Lucro!' : net < 0 ? 'Prejuízo...' : 'Empatou!';
  title.className = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
  const netEl = $('res-net');
  netEl.innerHTML = `<span class="coin"></span>${moedasComSinal(net)}`;
  netEl.className = 'net ' + (net > 0 ? 'pos' : net < 0 ? 'neg' : '');
  $('res-range').textContent = game.range.name;
  $('res-fee').textContent = `−${game.range.fee}`;
  const deAposta = ARROW_TYPES.filter(t => t.mercado);
  const somar = q => deAposta.reduce((s, t) => s + (Number(q?.[t.id]) || 0), 0);
  $('res-arrows').textContent = `${somar(compradas)} compradas · ${somar(sobraram)} guardadas`;
  $('res-hits').textContent = `${acertos} com ${disparadas} flecha${disparadas === 1 ? '' : 's'}`;
  const placar = linhasDoPlacar(game.placarPartida);
  $('res-mercado-linha').hidden = !placar.length;
  $('res-mercado').textContent = placar.map(l => l.texto).join(' · ');
  $('res-reais-linha').hidden = !placar.length;
  $('res-reais').textContent = `${moedasComSinal(game.apostasPartida)} moedas (${reaisComSinal(game.reaisPartida)})`;
  $('res-reais').className = game.apostasPartida > 0 ? 'pos' : game.apostasPartida < 0 ? 'neg' : '';
  $('res-wallet').textContent = moedas(game.wallet);
  $('res-aviso').textContent = falha
    ? `O servidor não confirmou o fim da rodada (${mensagemErro(falha)}). Ela será acertada na carteira automaticamente.`
    : '';
  $('btn-again').textContent = 'Jogar de novo';
  atualizarFalido();

  setState('result');
  net >= 0 ? sfx.win() : sfx.lose();

  // A carteira é atualizada pelo RabbitMQ (assíncrono): busca agora e de novo em 1,5 s.
  // A primeira leitura só vale se o resultado já entrou (senão mantém a estimativa).
  const jaAplicado = saldo => netCarteira === 0 || saldo !== saldoBase;
  atualizarCarteira({ aceitar: jaAplicado }).catch(() => {});
  setTimeout(() => atualizarCarteira().catch(() => {}), 1500);
}

// Botões do resultado conforme o saldo (sem moedas para nenhum campo: só voltar ao menu)
function atualizarFalido() {
  const again = $('btn-again');
  again.disabled = !canEnter(game.range);
  const broke = isBroke();
  $('res-broke').style.display = broke ? 'block' : 'none';
  again.style.display = broke ? 'none' : '';
  $('btn-change-range').style.display = broke ? 'none' : '';
  $('btn-restart').style.display = broke ? '' : 'none';
  $('btn-result-comprar').style.display = broke ? '' : 'none';
}

// ---------------------------------------------------------------------------
// Pássaros
// ---------------------------------------------------------------------------
function spawnBird() {
  const cfg = game.range;
  const typeId = pickBirdType(cfg.pool);
  const type = BIRD_TYPES[typeId];
  const dir = Math.random() < 0.5 ? 1 : -1;
  const amp = Math.random() < cfg.wobbleChance ? rand(15, cfg.wobbleAmp) : 0;
  const baseY = rand(70 + amp, 420);
  const phase = rand(0, Math.PI * 2);
  game.birds.push({
    type, typeId, dir,
    x: dir > 0 ? -60 : W + 60,
    y: baseY + amp * Math.sin(phase),
    baseY, amp, phase,
    freq: rand(1.2, 2.6),
    vx: dir * type.speed * cfg.speedMul * rand(0.85, 1.15),
    vy: 0,
    t: 0,
    flap: rand(0, 6),
    blink: rand(1, 4),
    state: 'flying',
    rot: 0,
    spin: 0,
  });
}

// Cotação de cada ativo em tempo real (Binance; reserva: market-data-service) que guia os pássaros de mercado.
// Só ficam conectadas durante a rodada.
const feeds = Object.fromEntries(LISTA_ATIVOS.map(a => [a.id, criarFeedPreco({
  simbolo: a.simbolo, precoSimulado: a.precoSimulado, assinar: api.assinarCotacao,
  usarBinance: a.provedor !== 'deriv',
  buscarReserva: () => api.cotacao(a.simbolo),
})]));

/**
 * Pássaro de mercado (bitcoin, ethereum, ouro). O "da flecha" nasce junto com a flecha do ativo: sai da esquerda
 * na altura do preço de agora e chega no alvo da direita no mesmo instante que ela. A escala (px por dólar) fica
 * fixa durante o voo, para a altura dele depender só do preço.
 */
function spawnPassaroMercado(ativo, { daFlecha = false } = {}) {
  const type = BIRD_TYPES[ativo];
  const feed = feeds[ativo];
  const dir = daFlecha || Math.random() < 0.5 ? 1 : -1;
  const baseY = daFlecha ? FLECHA_BTC.nivel : rand(170, 340);
  const bird = {
    type, typeId: ativo, dir,
    x: daFlecha ? FLECHA_BTC.xNascimento : dir > 0 ? -60 : W + 60,
    y: baseY, baseY, amp: 0, phase: 0, freq: 0,
    vx: daFlecha ? velocidadePassaroDaFlecha() : dir * type.speed * game.range.speedMul * rand(0.9, 1.1),
    vy: 0, t: 0,
    flap: rand(0, 6),
    blink: rand(1, 4),
    state: 'flying',
    rot: 0, spin: 0, tilt: 0,
    mercado: {
      ativo, precoInicial: feed.preco(), escala: feed.escala(), geracao: feed.geracao(), daFlecha,
      rastro: [], proximoPonto: 0, subindo: true,
    },
  };
  game.birds.push(bird);
  return bird;
}

/** Cada ativo solta um pássaro a cada `nasceACada` segundos (assim que houver cotação dele). */
function updateMercadoSpawner(dt) {
  for (const a of LISTA_ATIVOS.filter(x => game.range.ativos.includes(x.id))) {
    game.mercadoTimers[a.id] = (game.mercadoTimers[a.id] ?? a.nasceACada) - dt;
    if (game.mercadoTimers[a.id] > 0 || feeds[a.id].preco() === null) continue;
    game.mercadoTimers[a.id] = a.nasceACada;
    const voando = game.birds.filter(b => b.mercado?.ativo === a.id && !b.mercado.daFlecha && b.state === 'flying');
    if (voando.length < BTC_MAX_VOANDO) spawnPassaroMercado(a.id);
  }
}

/** Altura do pássaro de mercado pela variação do preço desde que ele nasceu, com rastro e inclinação. */
function voarMercado(b, dt) {
  const m = b.mercado;
  const feed = feeds[m.ativo];
  const preco = feed.preco();
  if (m.geracao !== feed.geracao()) {
    // o preço saltou (cotação real ⇄ simulada): continua de onde está
    m.geracao = feed.geracao();
    m.precoInicial = preco;
    m.escala = feed.escala();
    b.baseY = b.y;
  }
  const antes = b.y;
  b.y = alturaBtc(b.baseY, m.precoInicial, preco, m.escala);
  const subida = dt > 0 ? (antes - b.y) / dt : 0;
  b.tilt += (clamp(-b.dir * subida * 0.004, -0.5, 0.5) - b.tilt) * Math.min(1, dt * 8);
  m.subindo = preco >= m.precoInicial;
  m.proximoPonto -= dt;
  if (m.proximoPonto <= 0) {
    m.proximoPonto = 0.05;
    m.rastro.push({ x: b.x, y: b.y });
    if (m.rastro.length > 36) m.rastro.shift();
  }
}

/** Preferência do navegador: mostrar os pássaros comuns na rodada (padrão: sim). */
function lerPassarosComuns() {
  try {
    return localStorage.getItem('flecha-passaros-comuns') !== '0';
  } catch {
    return true;
  }
}

function togglePassarosComuns() {
  game.passarosComuns = !game.passarosComuns;
  try {
    localStorage.setItem('flecha-passaros-comuns', game.passarosComuns ? '1' : '0');
  } catch { /* sem armazenamento: vale só nesta visita */ }
  mostrarBotaoPassaros();
  avisar(game.passarosComuns ? 'Pássaros comuns de volta.' : 'Só os pássaros de criptomoeda na rodada.', 'info', 2500);
}

function mostrarBotaoPassaros() {
  const btn = $('btn-passaros');
  btn.classList.toggle('desligado', !game.passarosComuns);
  btn.title = game.passarosComuns ? 'Esconder os pássaros comuns (B)' : 'Mostrar os pássaros comuns (B)';
}

function updateSpawner(dt) {
  if (!game.passarosComuns && !inLobby()) return;   // rodada só com os pássaros de criptomoeda
  game.spawnTimer -= dt;
  const flying = game.birds.filter(b => b.state === 'flying').length;
  if (game.spawnTimer <= 0 && flying < game.range.maxBirds) {
    spawnBird();
    game.spawnTimer = game.range.spawnEvery * rand(0.7, 1.3);
  }
}

function updateBirds(dt) {
  for (const b of game.birds) {
    b.t += dt;
    if (b.state === 'flying') {
      b.flap += dt * (b.type.r < 20 ? 18 : 13);
      b.blink -= dt;
      if (b.blink < -0.12) b.blink = rand(1.5, 4);
      b.x += b.vx * dt;
      if (b.mercado) voarMercado(b, dt);
      else b.y = b.baseY + b.amp * Math.sin(b.phase + b.t * b.freq);
      if (b.type.shiny && Math.random() < dt * 30) spark(b.x - b.dir * b.type.r, b.y + rand(-8, 8));
      if ((b.dir > 0 && b.x > W + 80) || (b.dir < 0 && b.x < -80)) b.dead = true;
    } else {
      b.vy += G * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
      if (b.y > GROUND_Y - b.type.r * 0.4) {
        dust(b.x, GROUND_Y, 12);
        b.dead = true;
      }
    }
  }
  game.birds = game.birds.filter(b => !b.dead);
}

function hitBird(arrow, bird) {
  bird.state = 'falling';
  bird.vy = -140;
  bird.vx *= 0.25;
  bird.spin = rand(6, 10) * (Math.random() < 0.5 ? -1 : 1);

  arrow.hits++;
  game.hits++;
  if (arrow.type.mercado) {
    // aposta de mercado: as moedas vêm do servidor, pelo preço real, quando ele liquidar a aposta
    arrow.acertos.push(bird.typeId);
    addText(bird.x, bird.y - 34, 'acertou o lado!', '#b9f6ca', 26);
    impact(bird);
    sfx.hit();
    game.shake = 0.12;
    return;
  }
  // valor do pássaro × força da flecha × combo
  const coins = coinsForHit(bird.type, game.range, arrow.type, arrow.hits);
  if (coins <= 0) {
    // os pássaros não pagam moedas: acertar é treino (o servidor ainda conta o acerto)
    arrow.acertos.push(bird.typeId);
    addText(bird.x, bird.y - 34, arrow.hits > 1 ? `COMBO x${arrow.hits}!` : 'acertou!', '#ffffff', 28);
    impact(bird);
    sfx.hit();
    game.shake = 0.12;
    return;
  }
  arrow.acertos.push(bird.typeId);   // vai para o servidor quando a flecha terminar
  arrow.coins += coins;
  // estimativa local: o servidor confirma (ou corrige) quando o tiro for registrado
  game.earned += coins;
  game.wallet += coins;

  addText(bird.x, bird.y - 34, `+${coins}`, '#ffd54f', 38, true);
  if (arrow.type.coins > 1) {
    addText(bird.x, bird.y + bird.type.r + 26, `flecha de ${arrow.type.name.toLowerCase()} ×${formatMult(arrow.type.coins)}`, '#ffffff', 20);
  }
  if (arrow.hits > 1) {
    addText(bird.x, bird.y - 80, `COMBO x${arrow.hits}!`, '#ff8a50', 44);
    sfx.combo();
  }
  if (game.earned >= game.spent && game.earned - coins < game.spent) {
    addText(W / 2, 140, 'Investimento recuperado!', '#aed581', 34);
  }
  impact(bird);
  flyingCoins(bird.x, bird.y, Math.min(coins, 10));
  sfx.hit();
  sfx.coin();
  game.shake = 0.18;
}

// ---------------------------------------------------------------------------
// Flechas
// ---------------------------------------------------------------------------
function launchVelocity() {
  const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * game.aim.power;
  return { vx: Math.cos(game.aim.angle) * speed, vy: Math.sin(game.aim.angle) * speed };
}

/** Como a flecha na mão vai voar: velocidade, gravidade e, na flecha de mercado, o ponto onde ela chega em 5 s. */
function planoDoTiro() {
  const ativo = ARROW_BY_ID[game.selected]?.mercado;
  if (ativo) {
    const mirado = alvoFlechaBtc(LAUNCH, game.aim.angle, BTC_ALTURA);
    // sobe ou desce: a mira só escolhe o lado da linha de agora
    const alvo = { ...alvoBinario(mirado.y), ativo };
    return { ...velocidadeFlechaBtc(LAUNCH, alvo), g: FLECHA_BTC.g, alvo };
  }
  return { ...launchVelocity(), g: G, alvo: null };
}

/** Previsão de uma mira da flecha de mercado: preço de agora, preço previsto e a folga em dólares. */
function previsaoMercado(alvo) {
  const feed = feeds[alvo.ativo];
  const agora = feed.preco(), escala = feed.escala();
  const { casas } = ATIVOS[alvo.ativo];
  if (alvo.binaria) return { agora, casas, binaria: true, direcao: alvo.binaria };
  return {
    agora,
    casas,
    previsto: precoPrevisto(agora, escala, alvo.y),
    folga: toleranciaEmDolares(escala, BIRD_TYPES[alvo.ativo].r),
  };
}

function shoot() {
  ensureSelection();
  if (game.quiver[game.selected] <= 0) return;
  const v = planoDoTiro();
  if (v.alvo && feeds[v.alvo.ativo].preco() === null) {
    addText(LAUNCH.x + 160, LAUNCH.y - 120, `esperando a cotação do ${ATIVOS[v.alvo.ativo].nome}...`, '#ffe0b2', 24);
    return;
  }
  game.arrows.push({
    x0: LAUNCH.x, y0: LAUNCH.y, vx0: v.vx, vy0: v.vy, g: v.g, alvo: v.alvo, t: 0,
    x: LAUNCH.x, y: LAUNCH.y, px: LAUNCH.x, py: LAUNCH.y,
    angle: Math.atan2(v.vy, v.vx),
    type: ARROW_BY_ID[game.selected],
    trail: [],
    state: 'flying',
    life: 0,
    hits: 0,
    acertos: [],          // tipos dos pássaros acertados, em ordem
    coins: 0,             // moedas estimadas desta flecha
    reportado: false,     // já foi informada ao servidor?
  });
  if (v.alvo) {
    // no instante do disparo nasce o pássaro que chega no alvo junto com a flecha
    const ar = game.arrows[game.arrows.length - 1];
    ar.previsao = previsaoMercado(v.alvo);
    ar.passaro = spawnPassaroMercado(v.alvo.ativo, { daFlecha: true });
    registrarNoEstudo(ar);
  }
  game.quiver[game.selected]--;
  ensureSelection();
  game.shotsFired++;
  game.totalShots++;
  sfx.shoot();
}

function updateArrows(dt) {
  for (const ar of game.arrows) {
    if (ar.state === 'flying') {
      ar.px = ar.x;
      ar.py = ar.y;
      ar.t += dt;
      // Posição pela fórmula exata: a flecha segue exatamente a curva mostrada na mira
      ({ x: ar.x, y: ar.y } = arrowPosition(ar.x0, ar.y0, ar.vx0, ar.vy0, ar.g, ar.t));
      ar.angle = Math.atan2(ar.vy0 + ar.g * ar.t, ar.vx0);
      ar.trail.push({ x: ar.x, y: ar.y });
      if (ar.trail.length > 12) ar.trail.shift();

      if (ar.alvo) {
        // flecha bitcoin: não esbarra em nada no caminho, só vale quando chega no alvo
        if (ar.t >= FLECHA_BTC.tempo) chegarNoAlvo(ar);
        continue;
      }

      for (const b of game.birds) {
        if (b.state !== 'flying') continue;
        if (segmentHitsCircle(ar.px, ar.py, ar.x, ar.y, b.x, b.y, b.type.r * 0.95 + 3)) hitBird(ar, b);
      }

      if (ar.y >= GROUND_Y + 6) {
        ar.y = GROUND_Y + 6;
        ar.state = 'stuck';
        ar.trail = [];
        dust(ar.x, GROUND_Y, 7);
        sfx.thud();
        reportarTiro(ar);
      } else if (ar.x < -150 || ar.x > W + 150) {
        ar.dead = true;
        reportarTiro(ar);
      }
    } else {
      ar.life += dt;
      if (ar.life > 3) ar.dead = true;
    }
  }
  game.arrows = game.arrows.filter(a => !a.dead);
}

/** Flecha bitcoin no fim dos 5 s: acerta os pássaros bitcoin que estiverem no círculo do alvo. */
function chegarNoAlvo(ar) {
  ar.x = ar.alvo.x;
  ar.y = ar.alvo.y;
  if (ar.alvo.binaria) {
    // sobe ou desce: vale o pássaro desta flecha, se ele chegou do lado escolhido
    const b = ar.passaro;
    if (b && b.state === 'flying' && acertaBinario(ar.alvo.binaria, b)) {
      ar.x = b.x;
      ar.y = b.y;
      hitBird(ar, b);
    }
  } else {
    for (const b of game.birds) {
      if (b.state === 'flying' && acertaNoAlvo(ar.alvo, b)) hitBird(ar, b);
    }
  }
  game.particles.push({
    kind: 'ring', x: ar.x, y: ar.y, size: BIRD_TYPES[ar.alvo.ativo].r + FLECHA_BTC.raio,
    vx: 0, vy: 0, rot: 0, vr: 0, g: 0, life: 0, max: 0.4, color: ATIVOS[ar.alvo.ativo].cor,
  });
  for (let i = 0; i < 6; i++) spark(ar.x + rand(-12, 12), ar.y + rand(-12, 12), '#ffcc80');
  if (!ar.hits) addText(ar.x, ar.y - 40, 'passou!', '#ffe0b2', 26);
  ar.dead = true;
  reportarTiro(ar);
  acompanharEstudo(ar);
}

/**
 * No disparo: registra a aposta de 100 moedas (o servidor desconta a flecha e abre a operação na hora). Até a
 * resposta, o HUD conta a flecha como "no ar"; depois, vale o número do servidor.
 */
function registrarNoEstudo(ar) {
  if (!sessaoCtl) {
    ar.reportado = true;
    return;
  }
  ar.estudo = {
    pedido: sessaoCtl.registrarMercado({
      direcao: ar.previsao.direcao,
      simbolo: ATIVOS[ar.alvo.ativo].simbolo,
      tipo: 'BINARIA',
      precoAgora: Math.round(ar.previsao.agora * 100) / 100,
    }, () => { ar.reportado = true; }).catch(erro => {
      ar.reportado = true;      // a aposta não entrou: a flecha continua com o jogador no servidor
      reconciliar();
      return { erro };
    }),
  };
}

const ESPERA_RESULTADO_MS = 1000, TENTATIVAS_RESULTADO = 10;

/** Quando a flecha chega: espera o servidor liquidar a aposta e mostra quantas moedas ela rendeu. */
async function acompanharEstudo(ar) {
  if (!ar.estudo?.pedido) return;
  const registro = await ar.estudo.pedido;
  if (registro?.erro) {
    if (!tratadoPeloApp(registro.erro)) {
      mostrarEstudo({ texto: 'Aposta não registrada', detalhe: mensagemErro(registro.erro), cor: 'neutro' });
    }
    return;
  }
  for (let i = 0; i < TENTATIVAS_RESULTADO; i++) {
    const op = i === 0 && registro.moedasPagas !== null && registro.moedasPagas !== undefined
      ? registro
      : await esperar(ESPERA_RESULTADO_MS).then(() => api.operacaoEstudo(registro.id)).catch(() => null);
    const resultado = textoResultadoEstudo(op);
    if (resultado) {
      contarNoPlacar(game.placarPartida, ar.alvo.ativo, op);
      game.reaisPartida = somarResultadoReais(game.reaisPartida, op);
      game.apostasPartida = Math.round((game.apostasPartida + lucroDaAposta(op)) * 100) / 100;
      mostrarEstudo(resultado);
      // as moedas entram pelo servidor: durante a rodada, na sessão; depois dela, direto na carteira
      if (sessaoCtl) sessaoCtl.atualizar().catch(() => {});
      else atualizarCarteira().catch(() => {});
      return;
    }
  }
}

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
const COR_ESTUDO = { ganho: '#b9f6ca', perda: '#ff8a80', neutro: '#ffe0b2' };

function mostrarEstudo(resultado) {
  game.estudo = resultado;
  if (game.state === 'playing') {
    addText(FLECHA_BTC.xAlvo - 150, FLECHA_BTC.nivel - 120, resultado.texto, COR_ESTUDO[resultado.cor], 26, false, 3.5);
  }
}

// ---------------------------------------------------------------------------
// Partículas e textos flutuantes
// ---------------------------------------------------------------------------
function impact(b) {
  game.particles.push({ kind: 'ring', x: b.x, y: b.y, size: b.type.r, vx: 0, vy: 0, rot: 0, vr: 0, g: 0, life: 0, max: 0.35, color: '#fff' });
  game.particles.push({ kind: 'flash', x: b.x, y: b.y, size: b.type.r * 2.2, vx: 0, vy: 0, rot: 0, vr: 0, g: 0, life: 0, max: 0.18, color: '#fff' });
  for (let i = 0; i < 16; i++) {
    game.particles.push({
      kind: 'feather',
      x: b.x + rand(-6, 6), y: b.y + rand(-6, 6),
      vx: rand(-200, 200), vy: rand(-240, 40),
      rot: rand(0, 6), vr: rand(-7, 7),
      size: rand(6, 11) * (b.type.r / 25 * 0.5 + 0.5),
      color: i % 3 ? b.type.color : b.type.belly,
      g: 230, life: 0, max: rand(0.9, 1.6),
    });
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand(-0.2, 0.2);
    const sp = rand(160, 280);
    game.particles.push({
      kind: 'star',
      x: b.x, y: b.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      rot: rand(0, 6), vr: rand(-10, 10),
      size: rand(5, 8),
      color: '#ffeb3b',
      g: 350, life: 0, max: rand(0.45, 0.7),
    });
  }
}

function dust(x, y, n) {
  for (let i = 0; i < n; i++) {
    game.particles.push({
      kind: 'dust',
      x: x + rand(-10, 10), y: y - 4,
      vx: rand(-100, 100), vy: rand(-170, -40),
      rot: 0, vr: 0,
      size: rand(4, 8),
      color: scene().dust[i % 2],
      g: 380, life: 0, max: rand(0.45, 0.8),
    });
  }
}

function spark(x, y, color = '#fff59d') {
  game.particles.push({
    kind: 'spark', x, y,
    vx: rand(-20, 20), vy: rand(-20, 20),
    rot: rand(0, 6), vr: 0,
    size: rand(3, 6),
    color,
    g: 0, life: 0, max: rand(0.35, 0.6),
  });
}

function addText(x, y, text, color, size, coin = false, max = 1.2) {
  game.texts.push({ x, y, text, color, size, coin, life: 0, max });
}

// Moedas que saem do pássaro e voam até a carteira no HUD
const WALLET_POS = { get x() { return W / 2 - 150; }, y: 46 };
function flyingCoins(x, y, n) {
  for (let i = 0; i < n; i++) {
    game.particles.push({
      kind: 'coin',
      sx: x + rand(-15, 15), sy: y + rand(-15, 15),
      cx: x + rand(-120, 120), cy: y - rand(60, 200),   // ponto de controle da curva
      x, y, vx: 0, vy: 0, rot: 0, vr: 0, g: 0,
      size: 9,
      delay: i * 0.05,
      life: 0, max: 0.75 + i * 0.05,
    });
  }
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.life += dt;
    if (p.kind === 'coin') {
      const k = clamp((p.life - p.delay) / (p.max - p.delay), 0, 1);
      const e = k * k;
      p.x = (1 - e) * (1 - e) * p.sx + 2 * (1 - e) * e * p.cx + e * e * WALLET_POS.x;
      p.y = (1 - e) * (1 - e) * p.sy + 2 * (1 - e) * e * p.cy + e * e * WALLET_POS.y;
      p.rot = game.time * 8 + p.delay * 20;
      continue;
    }
    p.vx *= p.kind === 'feather' ? 0.97 : 0.985;
    p.vy += p.g * dt;
    if (p.kind === 'feather') p.vy = Math.min(p.vy, 90); // penas planam
    p.x += p.vx * dt + (p.kind === 'feather' ? Math.sin(p.life * 7 + p.rot) * 40 * dt : 0);
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  game.particles = game.particles.filter(p => p.life < p.max);

  for (const t of game.texts) {
    t.life += dt;
    t.y -= 38 * dt;
  }
  game.texts = game.texts.filter(t => t.life < t.max);
}

// ---------------------------------------------------------------------------
// Cenário do campo atual (veja scenery.js)
// ---------------------------------------------------------------------------
const scene = () => Scenery.get(game.range.theme);

// ---------------------------------------------------------------------------
// Loop de atualização
// ---------------------------------------------------------------------------
// Telas fora do campo de tiro (menu, loja e conta): só o cenário aparece ao fundo
const TELAS_FORA_DO_CAMPO = ['menu', 'ranges', 'buy', 'creditos', 'perfil', 'admin', 'bloqueado', 'saldo'];
const inLobby = () => TELAS_FORA_DO_CAMPO.includes(game.state);

function update(dt) {
  game.time += dt;
  scene().update(dt, game.time);

  // as cotações só são ouvidas durante a rodada, e só as das criptos do campo
  for (const [id, feed] of Object.entries(feeds)) {
    if (game.state === 'playing' && game.range.ativos.includes(id)) {
      if (!feed.ligado()) feed.ligar();
    } else if (feed.ligado()) {
      feed.desligar();
    }
    feed.atualizar(dt);
  }

  if (inLobby()) {
    // Pássaros voando no fundo do menu, só de enfeite
    updateSpawner(dt);
    updateBirds(dt);
    updateParticles(dt);
    return;
  }
  if (game.state !== 'playing') return;

  game.banner = Math.max(0, game.banner - dt);
  game.shake = Math.max(0, game.shake - dt);

  updateSpawner(dt);
  updateMercadoSpawner(dt);
  updateBirds(dt);
  updateArrows(dt);
  updateParticles(dt);
  if (game.encerrando || game.ocupado) return;

  // Sem flechas: espera a última cair e oferece comprar mais (se der) ou encerra
  if (!game.pending) {
    if (arrowsLeft() === 0 && !game.arrows.some(a => a.state === 'flying')) {
      game.pending = 'out';
      game.endTimer = 0.9;
    }
  } else {
    game.endTimer -= dt;
    if (game.endTimer <= 0) {
      game.pending = null;
      if (canRefill()) openRefill();
      else endSession();
    }
  }
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawBirdShadow(b) {
  const height = GROUND_Y - b.y;
  const k = clamp(1 - height / 650, 0.15, 1);
  ctx.fillStyle = `rgba(30,50,15,${0.22 * k})`;
  ctx.beginPath();
  ctx.ellipse(b.x, GROUND_Y - 6, b.type.r * (1.4 - k * 0.5), b.type.r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

function featherShape(len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -wid, len, 0);
  ctx.quadraticCurveTo(len * 0.5, wid, 0, 0);
  ctx.closePath();
}

// Corpo do pássaro voltado para a direita (+x), centrado em (0,0)
function drawBirdBody(T, r, flap, dead, blinking) {
  const lw = Math.max(1.6, r * 0.09);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Cauda (3 penas)
  for (const [a, l] of [[-0.45, 1.0], [0, 1.15], [0.45, 0.95]]) {
    ctx.save();
    ctx.translate(-r * 0.75, r * 0.05);
    ctx.rotate(Math.PI + a);
    featherShape(r * 0.85 * l, r * 0.22);
    ctx.fillStyle = T.dark;
    ctx.fill();
    ctx.strokeStyle = T.outline;
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
    ctx.restore();
  }

  // Topete (2 penas)
  for (const [a, l] of [[-1.9, 0.75], [-1.45, 0.95]]) {
    ctx.save();
    ctx.translate(-r * 0.05, -r * 0.82);
    ctx.rotate(a);
    featherShape(r * 0.7 * l, r * 0.2);
    ctx.fillStyle = T.color;
    ctx.fill();
    ctx.strokeStyle = T.outline;
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
    ctx.restore();
  }

  // Corpo com volume
  if (T.shiny) { ctx.shadowColor = 'rgba(255,240,150,0.95)'; ctx.shadowBlur = 24; }
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.05);
  body.addColorStop(0, T.light);
  body.addColorStop(0.5, T.color);
  body.addColorStop(1, T.dark);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Barriga
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
  const belly = ctx.createLinearGradient(0, r * 0.2, 0, r);
  belly.addColorStop(0, T.belly);
  belly.addColorStop(1, T.bellyDark);
  ctx.fillStyle = belly;
  ctx.beginPath(); ctx.ellipse(r * 0.2, r * 0.82, r * 0.88, r * 0.56, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.strokeStyle = T.outline;
  ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

  // Reflexo de luz
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.78, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();

  // Asa batendo
  ctx.save();
  ctx.translate(-r * 0.2, r * 0.05);
  const f = Math.sin(flap);
  ctx.rotate(-0.25 + f * 0.6);
  ctx.scale(1, 0.75 + Math.abs(f) * 0.35);
  const wing = ctx.createLinearGradient(0, -r * 0.3, 0, r * 0.3);
  wing.addColorStop(0, T.color);
  wing.addColorStop(1, T.dark);
  ctx.fillStyle = wing;
  ctx.beginPath(); ctx.ellipse(-r * 0.35, 0, r * 0.58, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = T.outline;
  ctx.lineWidth = lw * 0.8;
  ctx.stroke();
  ctx.restore();

  // Olhos
  const ey = -r * 0.2, er = r * 0.25;
  for (const ex of [r * 0.16, r * 0.56]) {
    const eg = ctx.createRadialGradient(ex - er * 0.3, ey - er * 0.3, er * 0.1, ex, ey, er);
    eg.addColorStop(0, '#ffffff');
    eg.addColorStop(1, '#dfe3e8');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = T.outline;
    ctx.lineWidth = lw * 0.6;
    ctx.stroke();
    if (dead) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      ctx.beginPath();
      ctx.moveTo(ex - er * 0.5, ey - er * 0.5); ctx.lineTo(ex + er * 0.5, ey + er * 0.5);
      ctx.moveTo(ex + er * 0.5, ey - er * 0.5); ctx.lineTo(ex - er * 0.5, ey + er * 0.5);
      ctx.stroke();
    } else if (blinking) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      ctx.beginPath(); ctx.moveTo(ex - er * 0.7, ey); ctx.lineTo(ex + er * 0.7, ey); ctx.stroke();
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.arc(ex + er * 0.32, ey + er * 0.12, er * 0.47, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + er * 0.45, ey - er * 0.05, er * 0.16, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Sobrancelha brava
  ctx.fillStyle = '#2b1b17';
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -r * 0.66);
  ctx.quadraticCurveTo(r * 0.4, -r * 0.62, r * 0.86, -r * 0.4);
  ctx.lineTo(r * 0.82, -r * 0.27);
  ctx.quadraticCurveTo(r * 0.38, -r * 0.44, -r * 0.08, -r * 0.48);
  ctx.closePath();
  ctx.fill();

  // Bico (duas partes)
  ctx.strokeStyle = '#8a3c00';
  ctx.lineWidth = lw * 0.6;
  const lower = ctx.createLinearGradient(0, r * 0.1, 0, r * 0.4);
  lower.addColorStop(0, '#f57c00');
  lower.addColorStop(1, '#d35400');
  ctx.fillStyle = lower;
  ctx.beginPath();
  ctx.moveTo(r * 0.6, r * 0.14);
  ctx.quadraticCurveTo(r * 0.95, r * 0.18, r * 1.12, r * 0.2);
  ctx.quadraticCurveTo(r * 0.9, r * 0.4, r * 0.6, r * 0.34);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  const upper = ctx.createLinearGradient(0, -r * 0.05, 0, r * 0.2);
  upper.addColorStop(0, '#ffd54f');
  upper.addColorStop(1, '#ff9800');
  ctx.fillStyle = upper;
  ctx.beginPath();
  ctx.moveTo(r * 0.58, -r * 0.06);
  ctx.quadraticCurveTo(r * 1.05, -r * 0.02, r * 1.32, r * 0.16);
  ctx.quadraticCurveTo(r * 0.95, r * 0.2, r * 0.58, r * 0.16);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
}

function drawBird(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.state === 'falling') ctx.rotate(b.rot);
  else if (b.tilt) ctx.rotate(b.tilt);
  ctx.scale(b.dir, 1);
  drawBirdBody(b.type, b.type.r, b.flap, b.state === 'falling', b.blink < 0);
  ctx.restore();
  if (b.mercado) drawMarcaMercado(b);
}

/** Símbolo do ativo (₿, Ξ, Au) na barriga do pássaro de mercado (fora do espelhamento, para não sair invertido). */
function drawMarcaMercado(b) {
  const r = b.type.r;
  const marca = ATIVOS[b.mercado.ativo].marca;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.state === 'falling' ? b.rot : b.tilt);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(r * (marca.length > 1 ? 0.7 : 0.95))}px Nunito, sans-serif`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(40,20,5,0.85)';
  ctx.strokeText(marca, -b.dir * r * 0.18, r * 0.3);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(marca, -b.dir * r * 0.18, r * 0.3);
  ctx.restore();
}

/** Rastro do pássaro de mercado, como uma linha de gráfico: verde se o preço subiu desde que ele nasceu. */
function drawRastroMercado(b) {
  const pts = b.mercado.rastro;
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = b.mercado.subindo ? '#43a047' : '#e53935';
  for (let i = 1; i < pts.length; i++) {
    ctx.globalAlpha = (i / pts.length) * 0.8;
    ctx.lineWidth = 2 + (i / pts.length) * 3;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

const FONTE_COTACAO = { binance: 'BINANCE AO VIVO', servidor: 'VIA SERVIDOR' };
const dolares = (v, casas = 0) =>
  `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;

/** Placa com as cotações que guiam os pássaros de mercado: uma linha por ativo. */
function drawTickerMercado() {
  const linhas = LISTA_ATIVOS.filter(a => game.range.ativos.includes(a.id) && feeds[a.id].preco() !== null);
  if (!linhas.length) return;
  const w = 280, h = 22 + linhas.length * 24;
  // botões HTML do canto direito (pausa, som, pássaros): 3 × 52 px + 2 vãos de 10 + margem de 16
  const botoes = 16 + 3 * 52 + 2 * 10;
  const cabeAoLado = W - botoes - 16 - w >= W / 2 + 200 + 16;   // à direita da placa central
  const x = cabeAoLado ? W - botoes - 16 - w : W - 16 - w;
  const y = cabeAoLado ? 14 : 16 + 52 + 14;
  plaque(x, y, w, h, 14);
  const algumSimulado = linhas.some(a => feeds[a.id].simulado());
  ctx.textAlign = 'right';
  ctx.font = '800 10px Nunito, sans-serif';
  ctx.fillStyle = 'rgba(255,240,215,0.85)';
  ctx.fillText(algumSimulado ? 'SIMULADO ONDE NÃO HÁ COTAÇÃO' : FONTE_COTACAO[feeds[linhas[0].id].fonte()] || '',
    x + w - 12, y + 15);
  linhas.forEach((a, i) => {
    const feed = feeds[a.id];
    const ly = y + 38 + i * 24;
    ctx.textAlign = 'left';
    outlinedText(a.marca, x + 12, ly, "18px 'Lilita One', sans-serif", a.cor, '#4a2a10', 4);
    outlinedText(dolares(feed.preco(), a.casas), x + 46, ly, "18px 'Lilita One', sans-serif", '#ffffff', '#4a2a10', 4);
    ctx.textAlign = 'right';
    ctx.font = '900 12px Nunito, sans-serif';
    const v = feed.variacao24h();
    if (feed.simulado()) {
      ctx.fillStyle = 'rgba(255,240,215,0.85)';
      ctx.fillText('simulado', x + w - 12, ly - 2);
    } else if (v !== null) {
      ctx.fillStyle = v >= 0 ? '#b9f6ca' : '#ff8a80';
      ctx.fillText(`${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% 24h`,
        x + w - 12, ly - 2);
    }
  });

  // acertos desta partida nas apostas de mercado, por ativo
  let proximoY = y + h + 8;
  const placar = linhasDoPlacar(game.placarPartida);
  if (placar.length) {
    const ph = 40;
    plaque(x, proximoY, w, ph, 12);
    ctx.textAlign = 'left';
    ctx.font = '800 10px Nunito, sans-serif';
    ctx.fillStyle = 'rgba(255,240,215,0.85)';
    ctx.fillText('ACERTOS NESTA PARTIDA', x + 12, proximoY + 14);
    // quanto as operações desta partida renderam (ou custaram) em reais
    ctx.textAlign = 'right';
    ctx.font = '900 11px Nunito, sans-serif';
    ctx.fillStyle = game.reaisPartida > 0 ? '#b9f6ca' : game.reaisPartida < 0 ? '#ff8a80' : 'rgba(255,240,215,0.85)';
    ctx.fillText(`saldo ${reaisComSinal(game.reaisPartida)}`, x + w - 12, proximoY + 14);
    ctx.textAlign = 'left';
    let px = x + 12;
    for (const { ativo, texto } of placar) {
      ctx.font = "15px 'Lilita One', sans-serif";
      outlinedText(texto, px, proximoY + 32, "15px 'Lilita One', sans-serif", ativo.cor, '#4a2a10', 3);
      px += ctx.measureText(texto).width + 14;
    }
    proximoY += ph + 8;
  }

  // último resultado do estudo (a operação feita com a previsão do jogador)
  if (game.estudo) {
    const ey = proximoY, eh = 44;
    plaque(x, ey, w, eh, 12);
    ctx.textAlign = 'left';
    outlinedText(game.estudo.texto, x + 14, ey + 21, "17px 'Lilita One', sans-serif",
      COR_ESTUDO[game.estudo.cor], '#4a2a10', 4);
    ctx.font = '800 11px Nunito, sans-serif';
    ctx.fillStyle = 'rgba(255,240,215,0.9)';
    const detalhe = game.estudo.detalhe.length > 46 ? `${game.estudo.detalhe.slice(0, 45)}…` : game.estudo.detalhe;
    ctx.fillText(detalhe, x + 14, ey + 37);
  }
}

// Flecha com a ponta em (0,0) apontando para +x, nas cores do seu tipo
function drawArrowShape(type = ARROW_TYPES[0], c = ctx) {
  c.lineCap = 'round';
  c.strokeStyle = type.shaft[0];
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(-ARROW_LEN, 0); c.lineTo(-10, 0); c.stroke();
  c.strokeStyle = type.shaft[1];
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(-ARROW_LEN, -0.5); c.lineTo(-10, -0.5); c.stroke();

  const k = type.headSize;
  if (type.glow) { c.shadowColor = type.glow; c.shadowBlur = 12; }
  const head = c.createLinearGradient(0, -6 * k, 0, 6 * k);
  head.addColorStop(0, type.head[0]);
  head.addColorStop(0.5, type.head[1]);
  head.addColorStop(1, type.head[2]);
  c.fillStyle = head;
  c.strokeStyle = type.headStroke;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(1, 0); c.lineTo(-15 * k, -6.5 * k); c.lineTo(-11 * k, 0); c.lineTo(-15 * k, 6.5 * k);
  c.closePath();
  c.fill();
  c.shadowBlur = 0;
  c.stroke();

  for (const s of [-1, 1]) {
    c.fillStyle = s < 0 ? type.fletch[0] : type.fletch[1];
    c.beginPath();
    c.moveTo(-ARROW_LEN + 18, 0);
    c.quadraticCurveTo(-ARROW_LEN + 6, s * 3, -ARROW_LEN - 3, s * 9);
    c.lineTo(-ARROW_LEN + 2, 0);
    c.closePath();
    c.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(-ARROW_LEN + 10, -2.5); c.lineTo(-ARROW_LEN + 6, -5); c.moveTo(-ARROW_LEN + 10, 2.5); c.lineTo(-ARROW_LEN + 6, 5); c.stroke();
  c.fillStyle = '#3e2723';
  c.fillRect(-ARROW_LEN - 2, -1.5, 3, 3);
}

/**
 * Régua da previsão na coluna do alvo: a faixa onde o pássaro pode chegar e a linha do preço no disparo
 * (o pássaro da flecha sai dessa altura; acima dela é preço maior, abaixo é menor).
 */
function drawRegua(previsao) {
  const precoReferencia = previsao ? previsao.agora : null;
  const x = FLECHA_BTC.xAlvo;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 8]);
  ctx.beginPath(); ctx.moveTo(x, BTC_ALTURA.min); ctx.lineTo(x, BTC_ALTURA.max); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,224,178,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - 46, FLECHA_BTC.nivel); ctx.lineTo(x + 46, FLECHA_BTC.nivel); ctx.stroke();
  ctx.textAlign = 'right';
  ctx.font = '900 12px Nunito, sans-serif';
  ctx.fillStyle = '#b9f6ca';
  ctx.fillText('▲ sobe', x - 50, BTC_ALTURA.min + 12);
  ctx.fillStyle = '#ff8a80';
  ctx.fillText('▼ cai', x - 50, BTC_ALTURA.max);
  if (precoReferencia !== null) {
    outlinedText(`agora ${dolares(precoReferencia, previsao.casas)}`, x - 50, FLECHA_BTC.nivel + 5, "800 13px Nunito, sans-serif",
      '#ffffff', 'rgba(40,20,5,0.8)', 3);
  }
  ctx.restore();
}

/** Alvo da flecha de mercado: o círculo onde ela acerta, o preço previsto e, em voo, a contagem até chegar. */
function drawAlvoMercado(alvo, resto, contagem, previsao) {
  if (alvo.binaria) {
    drawAlvoBinario(alvo, contagem, previsao);
    return;
  }
  const raio = BIRD_TYPES[alvo.ativo].r + FLECHA_BTC.raio;
  drawRegua(previsao);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,224,178,0.95)';
  ctx.fillStyle = 'rgba(255,224,178,0.14)';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.arc(alvo.x, alvo.y, raio, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(alvo.x - 10, alvo.y); ctx.lineTo(alvo.x + 10, alvo.y);
  ctx.moveTo(alvo.x, alvo.y - 10); ctx.lineTo(alvo.x, alvo.y + 10);
  ctx.stroke();
  ctx.textAlign = 'center';
  if (contagem === null) {
    outlinedText(`${FLECHA_BTC.tempo}s`, alvo.x, alvo.y - raio - 12, "20px 'Lilita One', sans-serif", '#ffe0b2', '#5d3000', 4);
  } else {
    // anel que se fecha conforme a flecha se aproxima
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(alvo.x, alvo.y, raio + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(resto, 0, 1));
    ctx.stroke();
    outlinedText(String(contagem), alvo.x, alvo.y - raio - 16, "26px 'Lilita One', sans-serif", '#ffe0b2', '#5d3000', 5);
  }
  if (previsao) {
    // o preço que o jogador está prevendo para daqui a 5 s (à esquerda do alvo: à direita não cabe)
    const delta = previsao.previsto - previsao.agora;
    const sinal = direcaoDaPrevisao(previsao) === null ? '=' : delta > 0 ? '▲' : '▼';
    const numero = v => v.toLocaleString('pt-BR', { minimumFractionDigits: previsao.casas,
      maximumFractionDigits: previsao.casas });
    const minimo = 10 ** -previsao.casas;
    ctx.textAlign = 'right';
    outlinedText(dolares(previsao.previsto, previsao.casas), alvo.x - raio - 14, alvo.y - 2,
      "20px 'Lilita One', sans-serif", '#ffffff', '#5d3000', 4);
    outlinedText(`${sinal} ${delta >= 0 ? '+' : '−'}${numero(Math.abs(delta))}  ±${numero(Math.max(minimo, previsao.folga))}`,
      alvo.x - raio - 14, alvo.y + 17, "800 13px Nunito, sans-serif",
      sinal === '▲' ? '#b9f6ca' : sinal === '▼' ? '#ff8a80' : '#ffffff', 'rgba(40,20,5,0.85)', 3);
  }
  ctx.restore();
}

/** Modo sobe ou desce: a faixa escolhida na coluna do alvo (acima ou abaixo da linha de agora). */
function drawAlvoBinario(alvo, contagem, previsao) {
  drawRegua(previsao);
  const sobe = alvo.binaria === 'ALTA';
  const y0 = sobe ? BTC_ALTURA.min : FLECHA_BTC.nivel;
  const y1 = sobe ? FLECHA_BTC.nivel : BTC_ALTURA.max;
  ctx.save();
  ctx.fillStyle = sobe ? 'rgba(67,160,71,0.24)' : 'rgba(229,57,53,0.24)';
  ctx.strokeStyle = sobe ? 'rgba(165,214,167,0.95)' : 'rgba(239,154,154,0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  roundRect(ctx, FLECHA_BTC.xAlvo - 48, y0, 96, y1 - y0, 12);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  outlinedText(sobe ? '▲ SOBE' : '▼ DESCE', FLECHA_BTC.xAlvo, alvo.y + 8, "21px 'Lilita One', sans-serif",
    sobe ? '#b9f6ca' : '#ff8a80', '#2a1a08', 4);
  outlinedText(contagem === null ? `${FLECHA_BTC.tempo}s` : String(contagem), FLECHA_BTC.xAlvo, alvo.y + 40,
    "24px 'Lilita One', sans-serif", '#ffe0b2', '#5d3000', 5);
  ctx.restore();
}

function drawArrows() {
  for (const ar of game.arrows) {
    if (ar.alvo && ar.state === 'flying') {
      const falta = FLECHA_BTC.tempo - ar.t;
      drawAlvoMercado(ar.alvo, falta / FLECHA_BTC.tempo, Math.max(1, Math.ceil(falta)), ar.previsao);
    }
    // Rastro
    if (ar.trail.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < ar.trail.length; i++) {
        const k = i / ar.trail.length;
        ctx.strokeStyle = `rgba(${ar.type.trail},${k * (ar.type.glow ? 0.7 : 0.45)})`;
        ctx.lineWidth = k * (ar.type.glow ? 5 : 3.5);
        ctx.beginPath();
        ctx.moveTo(ar.trail[i - 1].x - Math.cos(ar.angle) * ARROW_LEN, ar.trail[i - 1].y - Math.sin(ar.angle) * ARROW_LEN);
        ctx.lineTo(ar.trail[i].x - Math.cos(ar.angle) * ARROW_LEN, ar.trail[i].y - Math.sin(ar.angle) * ARROW_LEN);
        ctx.stroke();
      }
    }

    ctx.save();
    if (ar.state === 'stuck') ctx.globalAlpha = clamp(3 - ar.life, 0, 1);
    ctx.translate(ar.x, ar.y);
    ctx.rotate(ar.angle);
    drawArrowShape(ar.type);
    ctx.restore();

    // Indicador quando a flecha sobe acima da tela
    if (ar.state === 'flying' && ar.y < -10 && ar.x > 0 && ar.x < W) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = 'rgba(0,40,80,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ar.x, 6); ctx.lineTo(ar.x - 9, 22); ctx.lineTo(ar.x + 9, 22); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }
}

function drawArcher() {
  const a = game.aim;
  const ang = a.angle;
  const pull = a.active ? a.power : 0;
  const stringBack = -22 - pull * 38;
  const handX = LAUNCH.x + Math.cos(ang) * stringBack;
  const handY = LAUNCH.y + Math.sin(ang) * stringBack;
  const breath = Math.sin(game.time * 2.2) * 1.2;
  const sway = Math.sin(game.time * 1.6) * 3;
  const skin = '#f5c9a0', skinDark = '#d9a57a';

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Capa
  const cape = ctx.createLinearGradient(100, 510, 140, 580);
  cape.addColorStop(0, '#1b5e20');
  cape.addColorStop(1, '#0d3b12');
  ctx.fillStyle = cape;
  ctx.beginPath();
  ctx.moveTo(140, 512 + breath);
  ctx.quadraticCurveTo(110 + sway, 540, 100 + sway, 578);
  ctx.lineTo(118 + sway * 0.5, 572);
  ctx.lineTo(128, 580);
  ctx.quadraticCurveTo(128, 545, 146, 516 + breath);
  ctx.closePath();
  ctx.fill();

  // Aljava
  ctx.save();
  ctx.translate(124, 526 + breath);
  ctx.rotate(-0.35);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? '#c62828' : '#ef5350';
    ctx.beginPath(); ctx.moveTo(-6 + i * 6, -28); ctx.lineTo(-10 + i * 6, -42); ctx.lineTo(-2 + i * 6, -42); ctx.closePath(); ctx.fill();
  }
  const q = ctx.createLinearGradient(-10, 0, 10, 0);
  q.addColorStop(0, '#a1887f');
  q.addColorStop(1, '#5d4037');
  ctx.fillStyle = q;
  roundRect(ctx, -10, -30, 20, 46, 5);
  ctx.fill();
  ctx.strokeStyle = '#3e2723';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#ffca28';
  ctx.fillRect(-10, -22, 20, 3);
  ctx.restore();

  // Pernas e botas
  const leg = (x1, x2) => {
    ctx.strokeStyle = '#4e5d2a';
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(x1, 560); ctx.lineTo(x2, 586); ctx.stroke();
    const boot = ctx.createLinearGradient(0, 580, 0, 596);
    boot.addColorStop(0, '#8d5a3a');
    boot.addColorStop(1, '#4e2c17');
    ctx.fillStyle = boot;
    roundRect(ctx, x2 - 7, 580, 17, 14, 5);
    ctx.fill();
    ctx.strokeStyle = '#2e1a0e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };
  leg(136, 128);
  leg(148, 154);

  // Túnica
  const tunic = ctx.createLinearGradient(120, 0, 162, 0);
  tunic.addColorStop(0, '#2e7d32');
  tunic.addColorStop(0.55, '#43a047');
  tunic.addColorStop(1, '#2e7d32');
  ctx.fillStyle = tunic;
  ctx.beginPath();
  ctx.moveTo(128, 514 + breath);
  ctx.lineTo(156, 514 + breath);
  ctx.lineTo(162, 566);
  ctx.lineTo(149, 562); ctx.lineTo(141, 568); ctx.lineTo(132, 562); ctx.lineTo(121, 566);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1b4d1f';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(124, 543, 36, 6);
  ctx.fillStyle = '#ffca28';
  roundRect(ctx, 138, 542, 8, 8, 2);
  ctx.fill();

  // Braço de trás (puxando a corda)
  ctx.strokeStyle = '#2e7d32';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(138, 521 + breath); ctx.lineTo(handX, handY); ctx.stroke();

  // Cabeça
  ctx.fillStyle = '#5d3a1a';
  ctx.beginPath(); ctx.arc(138, 500 + breath, 16, 0, Math.PI * 2); ctx.fill();
  const face = ctx.createRadialGradient(146, 494 + breath, 3, 143, 500 + breath, 17);
  face.addColorStop(0, '#ffe0c2');
  face.addColorStop(1, skin);
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(143, 500 + breath, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = skinDark;
  ctx.beginPath(); ctx.arc(158, 503 + breath, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(150, 498 + breath, 3.2, 3.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b1b17';
  ctx.beginPath(); ctx.arc(151.5, 498.5 + breath, 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5d3a1a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(146, 492 + breath); ctx.lineTo(154, 491 + breath); ctx.stroke();
  ctx.strokeStyle = '#a0522d';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(152, 506 + breath, 3, 0.2, Math.PI - 0.6); ctx.stroke();

  // Chapéu de Robin Hood
  const hat = ctx.createLinearGradient(0, 470, 0, 496);
  hat.addColorStop(0, '#66bb6a');
  hat.addColorStop(1, '#2e7d32');
  ctx.fillStyle = hat;
  ctx.beginPath();
  ctx.moveTo(124, 494 + breath);
  ctx.quadraticCurveTo(138, 470 + breath, 162, 491 + breath);
  ctx.quadraticCurveTo(144, 488 + breath, 124, 494 + breath);
  ctx.moveTo(126, 492 + breath);
  ctx.quadraticCurveTo(112, 482 + breath, 104, 488 + breath);
  ctx.quadraticCurveTo(114, 478 + breath, 132, 482 + breath);
  ctx.fill();
  ctx.strokeStyle = '#1b5e20';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(134, 484 + breath); ctx.quadraticCurveTo(124, 464 + breath, 108 + sway * 0.3, 462 + breath); ctx.stroke();

  // Braço da frente (segurando o arco)
  ctx.strokeStyle = '#388e3c';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(150, 521 + breath); ctx.lineTo(LAUNCH.x, LAUNCH.y); ctx.stroke();

  // Arco, corda e flecha encaixada
  ctx.save();
  ctx.translate(LAUNCH.x, LAUNCH.y);
  ctx.rotate(ang);
  const R = 40, span = 1.15;
  const tipX = -R + R * Math.cos(span), tipY = R * Math.sin(span);

  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(stringBack, 0); ctx.lineTo(tipX, tipY); ctx.stroke();

  if (game.quiver[game.selected] > 0 && game.state === 'playing' && !game.pending) {
    ctx.save();
    ctx.translate(stringBack + ARROW_LEN, 0);
    drawArrowShape(ARROW_BY_ID[game.selected]);
    ctx.restore();
  }

  ctx.strokeStyle = '#3e2312';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(-R, 0, R, -span, span); ctx.stroke();
  const bowGrad = ctx.createLinearGradient(-R, -R, 0, R);
  bowGrad.addColorStop(0, '#d7a466');
  bowGrad.addColorStop(0.5, '#a86b32');
  bowGrad.addColorStop(1, '#d7a466');
  ctx.strokeStyle = bowGrad;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(-R, 0, R, -span, span); ctx.stroke();
  ctx.fillStyle = '#e8d5b0';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(tipX, s * tipY, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#4e2c17';
  roundRect(ctx, -4, -8, 8, 16, 2);
  ctx.fill();

  // Mãos
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(stringBack, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawTrajectory() {
  const a = game.aim;
  if (!a.active || !a.valid) return;

  // Elástico do arraste
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(a.cx, a.cy); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.arc(a.sx, a.sy, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();

  // Curva da flecha (a mesma fórmula usada no voo real)
  const v = planoDoTiro();
  const passos = v.alvo ? Math.round(FLECHA_BTC.tempo / PREVIEW_STEP) : 160;
  const pulse = (game.time * 2) % 1;   // pontinho que "corre" pela curva
  ctx.textAlign = 'center';
  for (let i = 1; i <= passos; i++) {
    const t = i * PREVIEW_STEP;
    const { x, y } = arrowPosition(LAUNCH.x, LAUNCH.y, v.vx, v.vy, v.g, t);
    if (y > GROUND_Y || x < -20 || x > W + 20) break;
    if (y < -20) continue;

    const major = i % 10 === 0;           // a cada 0,5 s
    const alpha = Math.max(0.3, 1 - t / (v.alvo ? 8 : 4));
    const running = Math.abs(((t * 2) % 1) - pulse) < 0.06;
    const r = major ? 6 : running ? 3.8 : 2.6;

    ctx.fillStyle = `rgba(10,40,80,${alpha * 0.22})`;
    ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = major ? `rgba(255,224,90,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = major ? `rgba(120,60,0,${alpha * 0.9})` : `rgba(15,45,85,${alpha * 0.7})`;
    ctx.lineWidth = major ? 2 : 1.4;
    ctx.stroke();

    if (i % 20 === 0) {                   // rótulo a cada 1 s
      const label = `${i / 20}s`;
      ctx.font = '900 14px Nunito, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = `rgba(20,40,70,${alpha * 0.65})`;
      roundRect(ctx, x - tw / 2 - 6, y - 30, tw + 12, 18, 9);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillText(label, x, y - 16);
    }
  }

  if (v.alvo) drawAlvoMercado(v.alvo, 1, null, feeds[v.alvo.ativo].preco() === null ? null : previsaoMercado(v.alvo));

  // Força e ângulo
  const deg = Math.round(-a.angle * 180 / Math.PI);
  ctx.font = '900 17px Nunito, sans-serif';
  const label = `Força ${Math.round(a.power * 100)}%  ·  ${deg}°`;
  const tw = ctx.measureText(label).width;
  plaque(150 - tw / 2 - 14, 420, tw + 28, 32, 12);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, 150, 442);
  const barW = tw + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, 150 - barW / 2, 456, barW, 7, 3.5);
  ctx.fill();
  const pg = ctx.createLinearGradient(150 - barW / 2, 0, 150 + barW / 2, 0);
  pg.addColorStop(0, '#8bc34a');
  pg.addColorStop(0.6, '#ffeb3b');
  pg.addColorStop(1, '#f44336');
  ctx.fillStyle = pg;
  roundRect(ctx, 150 - barW / 2, 456, Math.max(7, barW * a.power), 7, 3.5);
  ctx.fill();
}

function starPath(r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = i / 10 * Math.PI * 2 - Math.PI / 2;
    i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

function drawParticles() {
  for (const p of game.particles) {
    if (p.kind === 'coin') {
      if (p.life < p.delay) continue;
      const squash = Math.abs(Math.cos(p.rot));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(Math.max(0.25, squash), 1);
      drawCoin(0, 0, p.size);
      ctx.restore();
      continue;
    }
    const k = p.life / p.max;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = clamp(1 - k, 0, 1);
    switch (p.kind) {
      case 'feather':
        ctx.translate(-p.size, 0);
        featherShape(p.size * 2, p.size * 0.55);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.size * 2, 0); ctx.stroke();
        break;
      case 'dust':
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(0, 0, p.size * (1 + k), 0, Math.PI * 2); ctx.fill();
        break;
      case 'star':
        ctx.fillStyle = p.color;
        starPath(p.size);
        ctx.fill();
        ctx.strokeStyle = '#f57f17';
        ctx.lineWidth = 1;
        ctx.stroke();
        break;
      case 'spark':
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.25, 0); ctx.lineTo(0, p.size); ctx.lineTo(-p.size * 0.25, 0); ctx.closePath();
        ctx.moveTo(-p.size, 0); ctx.lineTo(0, p.size * 0.25); ctx.lineTo(p.size, 0); ctx.lineTo(0, -p.size * 0.25); ctx.closePath();
        ctx.fill();
        break;
      case 'ring':
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 6 * (1 - k);
        ctx.beginPath(); ctx.arc(0, 0, p.size * (1 + k * 1.8), 0, Math.PI * 2); ctx.stroke();
        break;
      case 'flash': {
        ctx.globalCompositeOperation = 'lighter';
        const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
        fg.addColorStop(0, 'rgba(255,255,230,0.9)');
        fg.addColorStop(1, 'rgba(255,255,230,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  // Textos de pontuação com "pop"
  ctx.textAlign = 'center';
  for (const t of game.texts) {
    const k = t.life / t.max;
    const scale = k < 0.12 ? 1.7 - (k / 0.12) * 0.7 : 1;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp(1.5 - k * 1.5, 0, 1);
    ctx.font = `${t.size}px 'Lilita One', sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(60,25,5,0.9)';
    ctx.strokeText(t.text, 0, 0);
    const tg = ctx.createLinearGradient(0, -t.size * 0.8, 0, 0);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(1, t.color);
    ctx.fillStyle = tg;
    ctx.fillText(t.text, 0, 0);
    if (t.coin) {
      const tw = ctx.measureText(t.text).width;
      drawCoin(tw / 2 + t.size * 0.42, -t.size * 0.34, t.size * 0.34);
    }
    ctx.restore();
  }
}

// Placa de madeira usada no HUD
function plaque(x, y, w, h, r) {
  ctx.fillStyle = 'rgba(30,15,5,0.3)';
  roundRect(ctx, x, y + 4, w, h, r);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#b5804b');
  g.addColorStop(1, '#7a4c26');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(60,30,10,0.12)';
  ctx.lineWidth = 1.5;
  for (let yy = y + 7; yy < y + h; yy += 9) {
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.bezierCurveTo(x + w * 0.3, yy - 2, x + w * 0.7, yy + 2, x + w, yy); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#4a2a10';
  ctx.lineWidth = 3;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,190,0.35)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 3));
  ctx.stroke();
}

function outlinedText(text, x, y, font, fill, stroke, lw) {
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawCoin(x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#fff7c2');
  g.addColorStop(0.35, '#ffd54f');
  g.addColorStop(0.8, '#f9a825');
  g.addColorStop(1, '#c77c00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a5200';
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(138,82,0,0.55)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.25, r * 0.14, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Espaços da aljava no HUD (clicáveis para trocar de flecha)
/** Espaços do HUD para as flechas deste campo (a madeira e as de mercado das criptos dele). */
const slotsHud = () => tiposNoCampo(game.range).map((t, i) => ({ id: t.id, x: 24 + i * 47, y: 58, w: 44, h: 52 }));

function drawHUD() {
  const r = game.range;

  // Placa esquerda: campo e aljava com os tipos de flecha
  plaque(16, 14, 340, 106, 16);
  ctx.textAlign = 'left';
  outlinedText(r.name, 32, 46, "24px 'Lilita One', sans-serif", '#ffffff', '#4a2a10', 5);

  slotsHud().forEach((s, i) => {
    const type = ARROW_BY_ID[s.id], n = game.quiver[s.id], sel = game.selected === s.id && n > 0;
    ctx.save();
    ctx.globalAlpha = n > 0 ? 1 : 0.35;
    ctx.fillStyle = sel ? 'rgba(255,213,79,0.3)' : 'rgba(40,20,5,0.4)';
    roundRect(ctx, s.x, s.y, s.w, s.h, 10);
    ctx.fill();
    if (sel) {
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(s.x + 26, s.y + 13);
    ctx.rotate(-0.8);
    ctx.scale(0.42, 0.42);
    drawArrowShape(type);
    ctx.restore();
    ctx.textAlign = 'right';
    outlinedText(`${n}`, s.x + s.w - 4, s.y + s.h - 6, "19px 'Lilita One', sans-serif", n > 0 && n <= 2 ? '#ff8a80' : '#ffffff', '#4a2a10', 4);
    ctx.textAlign = 'left';
    ctx.font = '900 11px Nunito, sans-serif';
    ctx.fillStyle = 'rgba(255,240,215,0.85)';
    ctx.fillText(String(i + 1), s.x + 5, s.y + 13);
    ctx.restore();
  });

  // Placa central: carteira e resultado da rodada
  const pw = 400, px = W / 2 - pw / 2;
  plaque(px, 14, pw, 96, 16);
  drawCoin(WALLET_POS.x, WALLET_POS.y, 15);
  ctx.textAlign = 'left';
  outlinedText(moedas(game.wallet), WALLET_POS.x + 24, WALLET_POS.y + 11, "32px 'Lilita One', sans-serif", '#ffe57f', '#4a2a10', 5);

  // resultado = entrada + o que as apostas renderam (as flechas que sobram ficam guardadas, não são perda)
  const net = resultadoDaRodada();
  ctx.textAlign = 'right';
  ctx.font = '900 13px Nunito, sans-serif';
  ctx.fillStyle = 'rgba(255,240,215,0.9)';
  ctx.fillText('RESULTADO DA RODADA', px + pw - 18, 34);
  outlinedText(moedasComSinal(net), px + pw - 18, 62, "28px 'Lilita One', sans-serif",
    net > 0 ? '#b9f6ca' : net < 0 ? '#ff8a80' : '#ffffff', '#4a2a10', 5);

  // Faixa: de onde vem o resultado
  const barX = px + 18, barW = pw - 36, barY = 76;
  ctx.fillStyle = 'rgba(40,20,5,0.55)';
  roundRect(ctx, barX, barY, barW, 22, 11);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = '900 14px Nunito, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(40,20,5,0.8)';
  const barLabel = `entrada −${moedas(game.range.fee)} · apostas ${moedasComSinal(game.apostasPartida)}`;
  ctx.strokeText(barLabel, W / 2, barY + 16);
  ctx.fillStyle = '#fff';
  ctx.fillText(barLabel, W / 2, barY + 16);

  // Faixa de entrada no campo
  if (game.banner > 0) drawBanner();

  // Dica até o primeiro tiro do jogador
  if (game.totalShots === 0 && game.banner <= 0 && !game.aim.active) {
    const pulse = 0.8 + Math.sin(game.time * 3.5) * 0.2;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.textAlign = 'center';
    ctx.font = '900 22px Nunito, sans-serif';
    const msg = 'Clique, arraste para trás e solte. Mire onde o pássaro VAI estar!';
    const tw = ctx.measureText(msg).width;
    plaque(W / 2 - tw / 2 - 20, 664, tw + 40, 42, 16);
    ctx.fillStyle = '#fff';
    ctx.fillText(msg, W / 2, 692);
    ctx.restore();
  }
}

function drawBanner() {
  const t = 2.6 - game.banner;            // tempo desde o início
  const appear = clamp(t / 0.35, 0, 1);
  const vanish = clamp(game.banner / 0.4, 0, 1);
  const ease = 1 - Math.pow(1 - appear, 3);
  const cy = H / 2 - 40;
  const w = 660 * (0.6 + 0.4 * ease), h = 96;

  ctx.save();
  ctx.globalAlpha = Math.min(appear, vanish);
  ctx.translate(W / 2, cy);

  // Pontas dobradas da fita
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#8e1b14';
    ctx.beginPath();
    ctx.moveTo(s * (w / 2 - 30), -h / 2 + 22);
    ctx.lineTo(s * (w / 2 + 50), -h / 2 + 22);
    ctx.lineTo(s * (w / 2 + 25), h / 2 - 15 + 22 - h / 2 + h / 2);
    ctx.lineTo(s * (w / 2 + 50), h / 2 + 22);
    ctx.lineTo(s * (w / 2 - 30), h / 2 + 22);
    ctx.closePath();
    ctx.fill();
  }
  const rg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  rg.addColorStop(0, '#ef5350');
  rg.addColorStop(1, '#b71c1c');
  ctx.fillStyle = rg;
  roundRect(ctx, -w / 2, -h / 2, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = '#6d0f0a';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(255,220,200,0.6)';
  ctx.lineWidth = 2;
  roundRect(ctx, -w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 6);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'center';
  outlinedText(game.range.name, 0, 18, "50px 'Lilita One', sans-serif", '#ffeb3b', '#5a0f08', 9);

  ctx.font = '900 22px Nunito, sans-serif';
  const sub = `${arrowsLeft()} flechas · pássaros valem ×${game.range.mult} · você investiu ${game.spent} moedas`;
  const tw = ctx.measureText(sub).width;
  ctx.fillStyle = 'rgba(40,20,5,0.7)';
  roundRect(ctx, -tw / 2 - 18, h / 2 + 34, tw + 36, 38, 19);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(sub, 0, h / 2 + 60);
  ctx.restore();
}

function render() {
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);

  ctx.save();
  if (game.shake > 0) ctx.translate(rand(-4, 4) * game.shake * 6, rand(-4, 4) * game.shake * 6);

  const sc = scene();
  sc.drawBack(ctx, game.time);

  for (const b of game.birds) drawBirdShadow(b);
  for (const b of game.birds) if (b.mercado && b.state === 'flying') drawRastroMercado(b);
  for (const b of game.birds) drawBird(b);

  if (!inLobby()) {
    drawArcher();
    drawArrows();
  }
  sc.drawFront(ctx, game.time);
  drawParticles();
  if (!inLobby()) drawTrajectory();
  ctx.restore();

  sc.drawVignette(ctx);
  if (!inLobby()) {
    drawHUD();
    drawTickerMercado();
  }
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------
function toGameCoords(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}

function canAim() {
  return game.state === 'playing' && !game.pending && arrowsLeft() > 0;
}

function updateAim() {
  const a = game.aim;
  const dx = a.sx - a.cx, dy = a.sy - a.cy;
  const dist = Math.hypot(dx, dy);
  a.power = clamp(dist / MAX_DRAG, 0, 1);
  if (dist > 4) a.angle = Math.atan2(dy, dx);
  a.valid = dist >= 18;
}

canvas.addEventListener('pointerdown', e => {
  if (!canAim()) return;
  audio(); // navegadores só liberam som depois de uma interação
  const p = toGameCoords(e);

  // Clique na aljava do HUD troca de flecha em vez de mirar
  const slot = slotsHud().find(s => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
  if (slot) { selectArrow(slot.id); return; }

  const a = game.aim;
  a.active = true;
  a.valid = false;
  a.sx = a.cx = p.x;
  a.sy = a.cy = p.y;
  a.power = 0;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  if (!game.aim.active) return;
  const p = toGameCoords(e);
  game.aim.cx = p.x;
  game.aim.cy = p.y;
  updateAim();
});

canvas.addEventListener('pointerup', () => {
  const a = game.aim;
  if (!a.active) return;
  a.active = false;
  if (a.valid && canAim()) shoot();
});

canvas.addEventListener('pointercancel', () => { game.aim.active = false; });

function togglePause() {
  if (game.encerrando) return;
  if (game.state === 'playing') { game.aim.active = false; setState('paused'); }
  else if (game.state === 'paused') setState('playing');
}

function toggleMute() {
  muted = !muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}

window.addEventListener('keydown', e => {
  if (e.target?.closest?.('input, textarea, select')) return;   // digitando no perfil/administração
  const k = e.key.toLowerCase();
  if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'm') toggleMute();
  else if (k === 'b' && game.state === 'playing') togglePassarosComuns();
  else if (game.state === 'playing' && /^[1-9]$/.test(k)) {
    const tipo = tiposNoCampo(game.range)[Number(k) - 1];
    if (tipo) selectArrow(tipo.id);
  }
});

// Se a aba perder o foco, pausa o jogo
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') togglePause();
});

$('btn-play').addEventListener('click', () => {
  audio();
  setState('ranges');
  atualizarCarteira().catch(() => {});   // saldo pode ter mudado (depósito, outra aba)
});
$('btn-ranges-back').addEventListener('click', () => setState('menu'));
$('range-grid').addEventListener('click', e => {
  const btn = e.target.closest('button[data-range]');
  if (btn && !btn.disabled) openBuy(RANGES[Number(btn.dataset.range)]);
});

$('arrow-shop').addEventListener('click', e => {
  const btn = e.target.closest('button[data-type]');
  if (btn && !btn.disabled) updateOrder(btn.dataset.type, Number(btn.dataset.d));
});
$('btn-enter').addEventListener('click', enterRange);
$('btn-buy-back').addEventListener('click', () => setState('ranges'));
$('btn-buy-fechar-aberta').addEventListener('click', encerrarRodadaAberta);

$('refill-options').addEventListener('click', e => {
  const btn = e.target.closest('button[data-type]');
  if (btn && !btn.disabled) buyMoreArrows(btn.dataset.type);
});
$('btn-refill-end').addEventListener('click', endSession);

$('btn-quit').addEventListener('click', endSession);
$('btn-again').addEventListener('click', () => openBuy(game.range));
$('btn-change-range').addEventListener('click', () => setState('ranges'));
$('btn-restart').addEventListener('click', () => setState('menu'));
$('btn-resume').addEventListener('click', togglePause);
$('btn-pause').addEventListener('click', togglePause);
$('btn-mute').addEventListener('click', toggleMute);
$('btn-passaros').addEventListener('click', togglePassarosComuns);
mostrarBotaoPassaros();

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

setState('menu');
requestAnimationFrame(frame);
