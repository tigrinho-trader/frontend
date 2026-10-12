// Regras do Flecha Certeira: pássaros, campos de tiro, flechas e economia.
// Tudo aqui é puro (sem DOM), para poder ser testado.

export const START_COINS = 100;
export const DEFAULT_ARROWS = 10;
export const MAX_ARROWS = 40;        // máximo de flechas na aljava, somando todos os tipos
export const REFILL_QTY = 5;         // flechas por compra quando a aljava esvazia

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Clareia (amt > 0) ou escurece (amt < 0) uma cor hex
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const target = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const mix = c => Math.round(c + (target - c) * p);
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

// coins = valor base do pássaro; o campo de tiro multiplica esse valor
export const BIRD_TYPES = {
  red:    { name: 'Vermelho', r: 25, color: '#e53935', belly: '#f8d4c8', speed: 170, coins: 2 },
  big:    { name: 'Grandão',  r: 36, color: '#7b5a4a', belly: '#e0c4ae', speed: 115, coins: 1 },
  yellow: { name: 'Amarelo',  r: 21, color: '#fbc02d', belly: '#fff3c4', speed: 290, coins: 4 },
  blue:   { name: 'Azul',     r: 16, color: '#42a5f5', belly: '#d6ecff', speed: 220, coins: 5 },
  gold:   { name: 'Dourado',  r: 19, color: '#ffca28', belly: '#fff8d0', speed: 360, coins: 15, shiny: true },
  // Não entra no sorteio dos campos: nasce sozinho a cada 2 s e voa conforme a cotação do BTC (bitcoin.js)
  btc:    { name: 'Bitcoin',  r: 23, color: '#f7931a', belly: '#ffe0b2', speed: 190, coins: 3, btc: true },
};

for (const t of Object.values(BIRD_TYPES)) {
  t.light = shade(t.color, 0.45);
  t.dark = shade(t.color, -0.35);
  t.outline = shade(t.color, -0.7);
  t.bellyDark = shade(t.belly, -0.12);
}

// Campos de tiro (o servidor usa as mesmas regras): quanto mais caro, mais cada pássaro vale (e mais difícil ele é).
// Custo = entrada (fixa) + preço de cada flecha. Equilíbrio: com 10 flechas de madeira
// é preciso acertar ~3 pássaros para recuperar o que gastou.
export const RANGES = [
  {
    slug: 'vilarejo', name: 'Campo do Vilarejo', theme: 'village', fee: 5, arrowPrice: 1, mult: 2, tier: 1,
    desc: 'Pássaros lentos e voo reto. Bom para treinar.',
    speedMul: 1.0, wobbleChance: 0, wobbleAmp: 0, spawnEvery: 1.6, maxBirds: 3,
    pool: { red: 5, big: 3, yellow: 1, blue: 0, gold: 0.3 },
  },
  {
    slug: 'bosque', name: 'Bosque dos Arqueiros', theme: 'forest', fee: 15, arrowPrice: 3, mult: 4, tier: 2,
    desc: 'Mais pássaros rápidos e alguns que sobem e descem.',
    speedMul: 1.15, wobbleChance: 0.2, wobbleAmp: 35, spawnEvery: 1.35, maxBirds: 4,
    pool: { red: 4, big: 2, yellow: 3, blue: 1, gold: 0.5 },
  },
  {
    slug: 'pico', name: 'Pico das Águias', theme: 'peak', fee: 40, arrowPrice: 8, mult: 10, tier: 3,
    desc: 'Pássaros velozes e voo em ondas. Mais dourados.',
    speedMul: 1.3, wobbleChance: 0.4, wobbleAmp: 50, spawnEvery: 1.1, maxBirds: 5,
    pool: { red: 3, big: 1, yellow: 3, blue: 3, gold: 0.8 },
  },
  {
    slug: 'reserva-real', name: 'Reserva Real', theme: 'royal', fee: 100, arrowPrice: 20, mult: 25, tier: 4,
    desc: 'Só para mestres: pássaros muito rápidos e imprevisíveis.',
    speedMul: 1.45, wobbleChance: 0.6, wobbleAmp: 65, spawnEvery: 0.9, maxBirds: 6,
    pool: { red: 2, big: 1, yellow: 3, blue: 4, gold: 1.2 },
  },
];
// O slug identifica o campo na API do trading-service (sessões do Flecha Certeira)
export const RANGE_BY_SLUG = Object.fromEntries(RANGES.map(r => [r.slug, r]));

// Tipos de flecha: custam "price" vezes o preço base do campo e multiplicam
// as moedas do pássaro por "coins". As melhores rendem um pouco mais por moeda
// gasta, mas cada erro sai bem mais caro (alto risco, alto retorno).
export const ARROW_TYPES = [
  {
    id: 'wood', name: 'Madeira', price: 1, coins: 1, desc: 'A flecha básica e barata.',
    shaft: ['#5d3a1a', '#c08a52'], head: ['#f5f7fa', '#a9b2bc', '#5f6a75'], headStroke: '#37414a',
    fletch: ['#ef5350', '#c62828'], trail: '255,255,255', headSize: 1,
  },
  {
    id: 'iron', name: 'Ferro', price: 2, coins: 2.5, desc: 'Ponta pesada que arranca mais moedas.',
    shaft: ['#3b2a1c', '#7d6248'], head: ['#e3eaee', '#7b8f9b', '#2f3d45'], headStroke: '#1c262b',
    fletch: ['#64b5f6', '#1565c0'], trail: '170,210,255', headSize: 1.2,
  },
  {
    id: 'gold', name: 'Ouro', price: 4, coins: 5.5, desc: 'Brilha e rende muitas moedas.',
    shaft: ['#3b2410', '#7a5530'], head: ['#fffbe0', '#ffca28', '#a86b00'], headStroke: '#7a4a00',
    fletch: ['#ffffff', '#ffd54f'], trail: '255,214,90', headSize: 1.25, glow: 'rgba(255,214,90,0.9)',
  },
  {
    id: 'diamond', name: 'Diamante', price: 8, coins: 12, desc: 'A mais cara. Para quem não erra.',
    shaft: ['#90a4ae', '#eceff1'], head: ['#ffffff', '#4dd0e1', '#00838f'], headStroke: '#006064',
    fletch: ['#e1bee7', '#8e24aa'], trail: '150,240,255', headSize: 1.35, glow: 'rgba(120,230,255,0.95)', sparkle: '#b2ebf2',
  },
  {
    // Especial: voa 5 s até o ponto mirado e só acerta o pássaro bitcoin (física em bitcoin.js)
    id: 'btc', name: 'Bitcoin', price: 1, coins: 2, especial: 'btc',
    desc: 'Leva 5 s até o ponto mirado e só acerta o pássaro bitcoin. Dobra as moedas dele.',
    shaft: ['#5d3a1a', '#f7931a'], head: ['#fff3e0', '#f7931a', '#8a4b00'], headStroke: '#5d3000',
    fletch: ['#ffffff', '#f7931a'], trail: '247,147,26', headSize: 1.25, glow: 'rgba(247,147,26,0.9)',
  },
];
export const ARROW_BY_ID = Object.fromEntries(ARROW_TYPES.map(t => [t.id, t]));
/** Da flecha mais cara para a mais barata (a ordem da lista não é a de preço: a bitcoin vem por último). */
export const ARROWS_BY_PRICE_DESC = [...ARROW_TYPES].sort((a, b) => b.price - a.price);

export const formatMult = m => String(m).replace('.', ',');

// ---------------------------------------------------------------------------
// Economia
// ---------------------------------------------------------------------------
export function birdValue(type, range) {
  return Math.round(type.coins * range.mult);
}

export const arrowCost = (type, range) => type.price * range.arrowPrice;

/** Moedas de um acerto: valor do pássaro × força da flecha × combo (n-ésimo pássaro da mesma flecha). */
export function coinsForHit(birdType, range, arrowType, comboHits = 1) {
  return Math.round(birdValue(birdType, range) * arrowType.coins) * comboHits;
}

export function emptyQuiver() {
  return Object.fromEntries(ARROW_TYPES.map(t => [t.id, 0]));
}

export const countArrows = q => ARROW_TYPES.reduce((s, t) => s + (q[t.id] || 0), 0);

export const orderCost = (order, range) =>
  ARROW_TYPES.reduce((s, t) => s + (order[t.id] || 0) * arrowCost(t, range), 0);

/** Entrada + 1 flecha de madeira: o mínimo para jogar num campo. */
export const minCost = range => range.fee + range.arrowPrice;
export const canEnter = (wallet, range) => wallet >= minCost(range);
export const isBroke = wallet => !RANGES.some(r => canEnter(wallet, r));

/** Ajusta um pedido ao saldo: corta das flechas mais caras primeiro e garante ao menos 1 flecha. */
export function fitOrder(order, range, wallet) {
  const fitted = { ...emptyQuiver(), ...order };
  const tooExpensive = () => range.fee + orderCost(fitted, range) > wallet;
  for (const { id } of ARROWS_BY_PRICE_DESC) {
    while (fitted[id] > 0 && tooExpensive()) fitted[id]--;
  }
  if (countArrows(fitted) === 0) fitted.wood = 1;
  return fitted;
}

/** Soma (ou tira) flechas de um tipo, respeitando o saldo e o limite da aljava. */
export function changeOrder(order, range, wallet, typeId, delta) {
  const next = { ...order };
  if (delta < 0) {
    next[typeId] = Math.max(0, next[typeId] + delta);
    return next;
  }
  const cost = arrowCost(ARROW_BY_ID[typeId], range);
  for (let k = 0; k < delta; k++) {
    const left = wallet - range.fee - orderCost(next, range);
    if (left < cost || countArrows(next) >= MAX_ARROWS) break;
    next[typeId]++;
  }
  return next;
}

/** Sorteia o tipo de pássaro conforme os pesos do campo. */
export function pickBirdType(pool, random = Math.random) {
  const entries = Object.entries(pool);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = random() * total;
  for (const [key, w] of entries) {
    if ((roll -= w) <= 0) return key;
  }
  return 'red';
}

// ---------------------------------------------------------------------------
// Física
// ---------------------------------------------------------------------------
/** O segmento (x1,y1)→(x2,y2) encosta no círculo? Evita a flecha "atravessar" um pássaro entre dois quadros. */
export function segmentHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1) : 0;
  const px = x1 + dx * t - cx, py = y1 + dy * t - cy;
  return px * px + py * py <= r * r;
}

/** Posição da flecha t segundos após o disparo (a mesma conta da linha pontilhada da mira). */
export function arrowPosition(x0, y0, vx, vy, g, t) {
  return { x: x0 + vx * t, y: y0 + vy * t + 0.5 * g * t * t };
}
