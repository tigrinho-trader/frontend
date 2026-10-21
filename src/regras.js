// Regras do Flecha Certeira: pássaros, campos de tiro, flechas e economia.
// Tudo aqui é puro (sem DOM), para poder ser testado.

export const START_COINS = 1000;
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
  red:    { name: 'Vermelho', r: 25, color: '#e53935', belly: '#f8d4c8', speed: 170, coins: 0 },
  big:    { name: 'Grandão',  r: 36, color: '#7b5a4a', belly: '#e0c4ae', speed: 115, coins: 0 },
  yellow: { name: 'Amarelo',  r: 21, color: '#fbc02d', belly: '#fff3c4', speed: 290, coins: 0 },
  blue:   { name: 'Azul',     r: 16, color: '#42a5f5', belly: '#d6ecff', speed: 220, coins: 0 },
  gold:   { name: 'Dourado',  r: 19, color: '#ffca28', belly: '#fff8d0', speed: 360, coins: 0, shiny: true },
  // Pássaros de mercado: não entram no sorteio dos campos; nascem sozinhos e voam conforme a cotação (bitcoin.js).
  // Nenhum pássaro paga moedas ao ser acertado: moeda só vem da aposta das flechas de mercado.
  btc:    { name: 'Bitcoin',  r: 23, color: '#f7931a', belly: '#ffe0b2', speed: 190, coins: 0, btc: true, mercado: 'btc' },
  eth:    { name: 'Ethereum', r: 23, color: '#627eea', belly: '#e3e8ff', speed: 190, coins: 0, mercado: 'eth' },
  ouro:   { name: 'Ouro PAXG', r: 23, color: '#c9a227', belly: '#fff1c1', speed: 190, coins: 0, mercado: 'ouro', shiny: true },
  v100:   { name: 'Volatilidade 100', r: 23, color: '#d32f2f', belly: '#ffe1e1', speed: 190, coins: 0, mercado: 'v100' },
};

for (const t of Object.values(BIRD_TYPES)) {
  t.light = shade(t.color, 0.45);
  t.dark = shade(t.color, -0.35);
  t.outline = shade(t.color, -0.7);
  t.bellyDark = shade(t.belly, -0.12);
}

// Campos de tiro (o servidor usa as mesmas regras): quanto mais caro, mais cada pássaro vale (e mais difícil ele é).
// Custo = entrada (fixa, em moedas com centavos: 0,5 / 1,5 / 4 / 10) + preço de cada flecha. Equilíbrio: com 10 flechas de madeira
// é preciso acertar ~3 pássaros para recuperar o que gastou.
export const RANGES = [
  {
    slug: 'vilarejo', name: 'Campo do Vilarejo', theme: 'village', fee: 0.5, arrowPrice: 1, mult: 2, tier: 1,
    ativos: ['btc'],
    desc: 'Pássaros lentos e voo reto. Bom para treinar.',
    speedMul: 1.0, wobbleChance: 0, wobbleAmp: 0, spawnEvery: 1.6, maxBirds: 3,
    pool: { red: 5, big: 3, yellow: 1, blue: 0, gold: 0.3 },
  },
  {
    slug: 'bosque', name: 'Bosque dos Arqueiros', theme: 'forest', fee: 1.5, arrowPrice: 3, mult: 4, tier: 2,
    ativos: ['btc', 'eth'],
    desc: 'Mais pássaros rápidos e alguns que sobem e descem.',
    speedMul: 1.15, wobbleChance: 0.2, wobbleAmp: 35, spawnEvery: 1.35, maxBirds: 4,
    pool: { red: 4, big: 2, yellow: 3, blue: 1, gold: 0.5 },
  },
  {
    slug: 'pico', name: 'Pico das Águias', theme: 'peak', fee: 4, arrowPrice: 8, mult: 10, tier: 3,
    ativos: ['btc', 'eth', 'ouro', 'v100'],
    desc: 'Pássaros velozes e voo em ondas. Mais dourados.',
    speedMul: 1.3, wobbleChance: 0.4, wobbleAmp: 50, spawnEvery: 1.1, maxBirds: 5,
    pool: { red: 3, big: 1, yellow: 3, blue: 3, gold: 0.8 },
  },
  {
    slug: 'reserva-real', name: 'Reserva Real', theme: 'royal', fee: 10, arrowPrice: 20, mult: 25, tier: 4,
    ativos: ['btc', 'eth', 'ouro', 'v100'],
    desc: 'Só para mestres: pássaros muito rápidos e imprevisíveis.',
    speedMul: 1.45, wobbleChance: 0.6, wobbleAmp: 65, spawnEvery: 0.9, maxBirds: 6,
    pool: { red: 2, big: 1, yellow: 3, blue: 4, gold: 1.2 },
  },
];
// O slug identifica o campo na API do trading-service (sessões do Flecha Certeira)
export const RANGE_BY_SLUG = Object.fromEntries(RANGES.map(r => [r.slug, r]));

// Tipos de flecha: custam "price" vezes o preço base do campo (a madeira é grátis) e multiplicam
// as moedas do pássaro por "coins" (hoje os pássaros valem 0: acertá-los é treino).
/**
 * Flechas de mercado (bitcoin, ethereum, ouro, Volatilidade 100): o jogador escolhe o VALOR de cada flecha, em
 * moedas (R$ 1 = 1 moeda). Níveis prontos: Nível 1 = 10, Nível 2 = 20, Nível 3 = 30; ou um valor personalizado
 * (mínimo 1, até 2 casas decimais). Quando a operação fecha, o servidor paga `moedasPagas`: previsão certa =
 * valor + lucro da operação; errada = 0; empate ou operação recusada = o valor de volta.
 */
export const NIVEIS_FLECHA = [10, 20, 30];
export const VALOR_MINIMO_FLECHA = 1;
export const VALOR_FLECHA_PADRAO = 10;
/** Taxa sobre as flechas de mercado não usadas, devolvidas em moedas ao sair do campo (o servidor manda a real). */
export const TAXA_DEVOLUCAO_PADRAO = 0.002;

export const ARROW_TYPES = [
  {
    id: 'wood', name: 'Madeira', price: 0, coins: 1, desc: 'Grátis: para treinar a mira.',
    shaft: ['#5d3a1a', '#c08a52'], head: ['#f5f7fa', '#a9b2bc', '#5f6a75'], headStroke: '#37414a',
    fletch: ['#ef5350', '#c62828'], trail: '255,255,255', headSize: 1,
  },
  {
    // Flechas de mercado: previsão do ativo em 5 s, alvo fixo na direita, só acertam o pássaro do ativo
    id: 'btc', name: 'Bitcoin', price: 1, precoFixo: null, coins: 2, especial: 'btc', mercado: 'btc',
    desc: 'Você escolhe o valor: o bitcoin sobe ou desce em 5 s? Acertou, volta o valor mais o lucro da operação; errou, perde o valor.',
    shaft: ['#5d3a1a', '#f7931a'], head: ['#fff3e0', '#f7931a', '#8a4b00'], headStroke: '#5d3000',
    fletch: ['#ffffff', '#f7931a'], trail: '247,147,26', headSize: 1.25, glow: 'rgba(247,147,26,0.9)',
  },
  {
    id: 'eth', name: 'Ethereum', price: 1, precoFixo: null, coins: 2, especial: 'eth', mercado: 'eth',
    desc: 'Você escolhe o valor: o ethereum sobe ou desce em 5 s? Acertou, volta o valor mais o lucro da operação; errou, perde o valor.',
    shaft: ['#2b2f4a', '#627eea'], head: ['#eef1ff', '#8c9eff', '#303f9f'], headStroke: '#1a237e',
    fletch: ['#ffffff', '#627eea'], trail: '98,126,234', headSize: 1.25, glow: 'rgba(98,126,234,0.9)',
  },
  {
    id: 'ouro', name: 'Ouro PAXG', price: 1, precoFixo: null, coins: 2, especial: 'ouro', mercado: 'ouro',
    desc: 'Você escolhe o valor: o ouro sobe ou desce em 5 s? Acertou, volta o valor mais o lucro da operação; errou, perde o valor.',
    shaft: ['#4a3410', '#c9a227'], head: ['#fffbe6', '#e6c35c', '#8a6d10'], headStroke: '#5c4708',
    fletch: ['#ffffff', '#c9a227'], trail: '201,162,39', headSize: 1.25, glow: 'rgba(230,195,92,0.9)',
  },
  {
    id: 'v100', name: 'Volatilidade 100', price: 1, precoFixo: null, coins: 2, especial: 'v100', mercado: 'v100',
    desc: 'Você escolhe o valor: o Volatilidade 100 sobe ou desce em 5 ticks (~5 s)? Acertou, volta o valor mais o lucro da operação; errou, perde o valor.',
    shaft: ['#3b1010', '#d32f2f'], head: ['#fff0f0', '#ef5350', '#8e1b1b'], headStroke: '#5d1010',
    fletch: ['#ffffff', '#d32f2f'], trail: '211,47,47', headSize: 1.25, glow: 'rgba(211,47,47,0.9)',
  },
];
export const ARROW_BY_ID = Object.fromEntries(ARROW_TYPES.map(t => [t.id, t]));
/** Flechas comuns da mais cara para a mais barata (as de mercado têm o valor escolhido e ficam de fora). */
export const ARROWS_BY_PRICE_DESC = ARROW_TYPES.filter(t => !t.mercado).sort((a, b) => b.price - a.price);

export const formatMult = m => String(m).replace('.', ',');

// ---------------------------------------------------------------------------
// Economia
// ---------------------------------------------------------------------------
/** Arredonda para centavos (os valores das flechas têm até 2 casas). */
export const centavos = v => Math.round((Number(v) || 0) * 100) / 100;

export function birdValue(type, range) {
  return Math.round(type.coins * range.mult);
}

/**
 * Custo de uma flecha no campo. Nas de mercado é o valor escolhido para ela (`valores[id]`, por tipo); sem escolha,
 * o valor padrão.
 */
export const arrowCost = (type, range, valores = {}) => type.mercado
  ? Number(valores?.[type.id] ?? VALOR_FLECHA_PADRAO)
  : type.price * range.arrowPrice;

/** Moedas de um acerto: valor do pássaro × força da flecha × combo (n-ésimo pássaro da mesma flecha). */
export function coinsForHit(birdType, range, arrowType, comboHits = 1) {
  return Math.round(birdValue(birdType, range) * arrowType.coins) * comboHits;
}

export function emptyQuiver() {
  return Object.fromEntries(ARROW_TYPES.map(t => [t.id, 0]));
}

export const countArrows = q => ARROW_TYPES.reduce((s, t) => s + (q[t.id] || 0), 0);

export const orderCost = (order, range, valores = {}) =>
  centavos(ARROW_TYPES.reduce((s, t) => s + (order[t.id] || 0) * arrowCost(t, range, valores), 0));

/** Flechas que aparecem neste campo (loja, HUD, teclas): a madeira e as de mercado das criptos do campo. */
export const tiposNoCampo = range =>
  ARROW_TYPES.filter(t => !t.mercado || (range?.ativos || []).includes(t.mercado));

/** A madeira é grátis: o mínimo para jogar num campo é a entrada. */
export const minCost = range => centavos(range.fee + arrowCost(ARROW_BY_ID.wood, range));
export const canEnter = (wallet, range) => centavos(wallet) >= minCost(range);
export const isBroke = wallet => !RANGES.some(r => canEnter(wallet, r));

/**
 * Ajusta um pedido ao saldo: corta das flechas mais caras (neste campo) primeiro e garante ao menos 1 flecha,
 * contando as `guardadas` que o jogador já tem para este campo.
 */
export function fitOrder(order, range, wallet, guardadas = 0, valores = {}) {
  const fitted = { ...emptyQuiver(), ...order };
  const tooExpensive = () => centavos(range.fee + orderCost(fitted, range, valores)) > centavos(wallet);
  const porCusto = [...ARROW_TYPES].sort((a, b) => arrowCost(b, range, valores) - arrowCost(a, range, valores));
  for (const { id } of porCusto) {
    while (fitted[id] > 0 && tooExpensive()) fitted[id]--;
  }
  if (countArrows(fitted) + guardadas === 0) fitted.wood = 1;
  return fitted;
}

/** Soma (ou tira) flechas de um tipo, respeitando o saldo e o limite da aljava (somando as `guardadas`). */
export function changeOrder(order, range, wallet, typeId, delta, guardadas = 0, valores = {}) {
  const next = { ...order };
  if (delta < 0) {
    next[typeId] = Math.max(0, next[typeId] + delta);
    return next;
  }
  const cost = arrowCost(ARROW_BY_ID[typeId], range, valores);
  for (let k = 0; k < delta; k++) {
    const left = centavos(wallet - range.fee - orderCost(next, range, valores));
    if (left < cost || countArrows(next) + guardadas >= MAX_ARROWS) break;
    next[typeId]++;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Valor (nível) das flechas de mercado e lotes da aljava
// ---------------------------------------------------------------------------
/** Nível de um valor: 1, 2 ou 3 para 10, 20 e 30 moedas; 0 para um valor personalizado. */
export function nivelDoValor(valor, niveis = NIVEIS_FLECHA) {
  const i = niveis.indexOf(centavos(valor));
  return i >= 0 ? i + 1 : 0;
}

/**
 * Aparência da flecha (1 a 3): quanto maior o valor, mais forte o brilho. Valores personalizados usam o visual do
 * nível logo abaixo deles (acima de 30, o do nível 3).
 */
export function visualDoValor(valor, niveis = NIVEIS_FLECHA) {
  const v = Number(valor) || 0;
  let visual = 1;
  niveis.forEach((n, i) => { if (v >= n) visual = i + 1; });
  return Math.min(3, visual);
}

const fmtValor = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
/** Valor em moedas, ex.: "12,5". */
export const textoValor = valor => fmtValor.format(Number(valor) || 0);

/** Selo do valor no HUD: "N1", "N2", "N3" ou o valor personalizado ("15", "12,5"). */
export function seloDoValor(valor, niveis = NIVEIS_FLECHA) {
  const n = nivelDoValor(valor, niveis);
  return n ? `N${n}` : textoValor(valor);
}

/** Nome do valor para as telas: "Nível 2 · 20 moedas" ou "Personalizado · 15 moedas". */
export function nomeDoValor(valor, niveis = NIVEIS_FLECHA) {
  const n = nivelDoValor(valor, niveis);
  const moedas = `${textoValor(valor)} moeda${centavos(valor) === 1 ? '' : 's'}`;
  return n ? `Nível ${n} · ${moedas}` : `Personalizado · ${moedas}`;
}

/**
 * Lê o valor digitado para uma flecha de mercado (aceita vírgula). Devolve `{ valor }` ou `{ erro }`.
 * `maximo` (opcional): o saldo disponível.
 */
export function lerValorFlecha(texto, { minimo = VALOR_MINIMO_FLECHA, maximo = Infinity } = {}) {
  const limpo = String(texto ?? '').trim().replace(',', '.');
  if (!limpo) return { erro: 'Digite o valor da flecha.' };
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) {
    return { erro: /^\d+\.\d{3,}$/.test(limpo) ? 'Use no máximo 2 casas decimais.' : 'Digite um número, ex.: 15 ou 12,50.' };
  }
  const valor = centavos(limpo);
  if (valor < minimo) return { erro: `O valor mínimo é ${textoValor(minimo)} moeda${minimo === 1 ? '' : 's'}.` };
  if (valor > maximo) return { erro: `Acima do seu saldo (${textoValor(maximo)} moedas).` };
  return { valor };
}

/** Próximo nível acima do valor (upgrade), ou null se já está no nível 3 ou acima. */
export function proximoNivel(valor, niveis = NIVEIS_FLECHA) {
  return niveis.find(n => n > centavos(valor)) ?? null;
}

/** Nível abaixo do valor (rebaixar), ou null se já está no nível 1 ou abaixo. */
export function nivelAnterior(valor, niveis = NIVEIS_FLECHA) {
  return [...niveis].reverse().find(n => n < centavos(valor)) ?? null;
}

/** Lotes de mercado de um pedido da loja: `[{ flecha, valor, quantidade }]` (só os tipos com quantidade). */
export function mercadoDoPedido(order, valores = {}) {
  return ARROW_TYPES.filter(t => t.mercado && order?.[t.id] > 0)
    .map(t => ({ flecha: t.id, valor: centavos(valores?.[t.id] ?? VALOR_FLECHA_PADRAO), quantidade: order[t.id] }));
}

/** Flechas comuns (sem valor) de um pedido: `{ wood: n }`. */
export function comunsDoPedido(order) {
  return Object.fromEntries(ARROW_TYPES.filter(t => !t.mercado).map(t => [t.id, Number(order?.[t.id]) || 0]));
}

/** Chave de um espaço da aljava: o tipo nas comuns ("wood"); tipo e valor nas de mercado ("btc@20"). */
export const chaveLote = (flecha, valor = null) =>
  (valor === null || valor === undefined ? flecha : `${flecha}@${centavos(valor)}`);

/**
 * Lotes de mercado de uma sessão (`sessao.mercado`), somando os repetidos e sem os vazios. Servidor antigo (sem
 * `mercado`): um lote por tipo, com o valor padrão.
 */
export function lotesDaSessao(sessao) {
  const lista = Array.isArray(sessao?.mercado)
    ? sessao.mercado
    : ARROW_TYPES.filter(t => t.mercado)
      .map(t => ({ flecha: t.id, valor: VALOR_FLECHA_PADRAO, quantidade: sessao?.flechas?.[t.id] }));
  const lotes = new Map();
  for (const l of lista) {
    const quantidade = Number(l?.quantidade) || 0;
    if (!ARROW_BY_ID[l?.flecha]?.mercado || quantidade <= 0) continue;
    const valor = centavos(l.valor ?? VALOR_FLECHA_PADRAO);
    const chave = chaveLote(l.flecha, valor);
    lotes.set(chave, { flecha: l.flecha, valor, quantidade: (lotes.get(chave)?.quantidade || 0) + quantidade });
  }
  return [...lotes.values()];
}

/**
 * Espaços da aljava no HUD: a madeira e um espaço por lote de mercado (tipo + valor), na ordem dos tipos do campo
 * e do menor valor para o maior. Tipo de mercado sem lote aparece vazio (valor null). Cada espaço:
 * `{ chave, id, valor, n }`.
 */
export function espacosDaAljava(range, quiver, lotes) {
  const espacos = [];
  for (const t of tiposNoCampo(range)) {
    if (!t.mercado) {
      espacos.push({ chave: t.id, id: t.id, valor: null, n: Number(quiver?.[t.id]) || 0 });
      continue;
    }
    const doTipo = (lotes || []).filter(l => l.flecha === t.id).sort((a, b) => a.valor - b.valor);
    if (!doTipo.length) espacos.push({ chave: t.id, id: t.id, valor: null, n: 0 });
    for (const l of doTipo) espacos.push({ chave: chaveLote(t.id, l.valor), id: t.id, valor: l.valor, n: l.quantidade });
  }
  return espacos;
}

/**
 * Linha do resultado com a devolução das flechas de mercado não usadas (`devolucaoFlechas` da sessão encerrada),
 * ex.: "Flechas devolvidas: 3 · +59,88 moedas (taxa 0,12)". Sem devolução, ''.
 */
export function textoDevolucao(devolucao) {
  const quantidade = Number(devolucao?.quantidade) || 0;
  if (quantidade <= 0) return '';
  const devolvido = Number(devolucao.valorDevolvido) || 0;
  return `Flechas devolvidas: ${quantidade} · +${textoValor(devolvido)} moedas (taxa ${textoValor(devolucao.taxa)})`;
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
