// Regras de apresentacao do jogo. Os numeros (multiplicadores, faixas) vem do backend em /api/ordens/regras;
// aqui fica so o que e visual ou calculado em cima deles.

export const MODOS = {
  FACIL: { nome: "Fácil", emoji: "🐱", frase: "Perde só metade se errar" },
  DIFICIL: { nome: "Difícil", emoji: "🐯", frase: "O clássico do tigrinho" },
  INSANO: { nome: "Insano", emoji: "🔥", frase: "Paga muito, perdoa nada" },
};

export const TIPOS = {
  ALTA: { nome: "Sobe", seta: "▲" },
  BAIXA: { nome: "Desce", seta: "▼" },
  LATERAL: { nome: "Parado", seta: "◆" },
};

export const FICHAS = [5, 10, 25, 50, 100, 250];

const numero = (casas) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function formatarFichas(valor) {
  return numero(2).format(Number(valor) || 0);
}

/** Preco com casas suficientes pra ver o movimento: BTC com 2, moedas baratas com ate 6. */
export function formatarPreco(valor) {
  const v = Number(valor) || 0;
  const casas = v >= 1000 ? 2 : v >= 1 ? 4 : 6;
  return numero(casas).format(v);
}

export function nomeAtivo(simbolo) {
  return simbolo.replace(/USDT$/, "");
}

export function variacaoPercentual(entrada, atual) {
  const e = Number(entrada);
  return e ? ((Number(atual) - e) / e) * 100 : 0;
}

/** Quanto a aposta paga no modo escolhido, a partir das regras do backend. */
export function multiplicador(regraModo, tipo) {
  if (!regraModo) return 0;
  return Number(tipo === "LATERAL" ? regraModo.multiplicadorLateral : regraModo.multiplicadorDirecional);
}

/**
 * Situacao da rodada se ela fechasse agora (so pra tela; quem decide e o trading-service).
 * Mesma regra das estrategias do backend.
 */
// folga pra erro de ponto flutuante: (100.02 - 100) / 100 * 100 da 0.01999... em JS (o backend usa BigDecimal)
const FOLGA = 1e-9;

export function situacaoParcial(tipo, regraModo, precoEntrada, precoAtual) {
  if (!regraModo || precoAtual == null) return "EMPATOU";
  const variacao = variacaoPercentual(precoEntrada, precoAtual);
  if (tipo === "LATERAL") {
    return Math.abs(variacao) <= Number(regraModo.toleranciaLateralPercentual) + FOLGA ? "GANHOU" : "PERDEU";
  }
  const movimento = tipo === "ALTA" ? variacao : -variacao;
  const minimo = Number(regraModo.movimentoMinimoPercentual);
  if (minimo === 0) {
    if (Math.abs(movimento) < FOLGA) return "EMPATOU";
    return movimento > 0 ? "GANHOU" : "PERDEU";
  }
  return movimento >= minimo - FOLGA ? "GANHOU" : "PERDEU";
}

export function segundosRestantes(expiraEm, agora = Date.now()) {
  return Math.max(0, Math.ceil((new Date(expiraEm).getTime() - agora) / 1000));
}

/** Vitorias seguidas a partir da rodada mais recente ja resolvida (empate nao quebra nem soma). */
export function sequenciaVitorias(ordens) {
  let seguidas = 0;
  for (const o of ordens) {
    if (o.status === "ABERTA" || o.status === "EMPATOU") continue;
    if (o.status !== "GANHOU") break;
    seguidas++;
  }
  return seguidas;
}

// ---------- Roleta do Tigre ----------

/** Uma fatia pra cada combinacao ativo x tipo de aposta. */
export function fatiasRoleta(simbolos) {
  return simbolos.flatMap((simbolo) => Object.keys(TIPOS).map((tipo) => ({ simbolo, tipo })));
}

export function sortearFatia(total, aleatorio = Math.random) {
  return Math.min(total - 1, Math.floor(aleatorio() * total));
}

/**
 * Rotacao final (graus) pra fatia sorteada parar debaixo do ponteiro (no topo),
 * sempre girando pra frente a partir da rotacao atual.
 */
export function anguloRoleta(indice, total, rotacaoAtual = 0, voltas = 5) {
  const fatia = 360 / total;
  const alvo = 360 - (indice * fatia + fatia / 2);
  const base = Math.ceil(rotacaoAtual / 360) * 360;
  return base + voltas * 360 + alvo;
}

// ---------- Escada (deixa o premio rodando) ----------

export const DEGRAUS_ESCADA = 5;

export function novaEscada(valorInicial) {
  return { valorInicial, valorAtual: valorInicial, degraus: [], fim: null };
}

/** Lucro ou prejuizo da escada inteira em relacao a primeira aposta. */
export function resultadoEscada(escada) {
  if (escada.fim === "CAIU") {
    const ultimo = escada.degraus[escada.degraus.length - 1];
    return ultimo.valorPago - escada.valorInicial;
  }
  return escada.valorAtual - escada.valorInicial;
}

/** Quanto a escada paga em cada degrau se todos forem acertados com o mesmo multiplicador. */
export function premiosEscada(valorInicial, mult, valorMaximo = Infinity) {
  const premios = [];
  let atual = valorInicial;
  for (let i = 0; i < DEGRAUS_ESCADA; i++) {
    atual = Math.round(Math.min(atual, valorMaximo) * mult * 100) / 100;
    premios.push(atual);
  }
  return premios;
}

/**
 * Aplica o resultado de uma rodada: vitoria sobe um degrau e o premio inteiro vira a proxima aposta;
 * empate repete o degrau; derrota derruba a escada. No topo, encerra com o premio.
 */
export function avancarEscada(escada, ordem, valorMaximo = Infinity) {
  const degraus = [...escada.degraus, { status: ordem.status, valorPago: Number(ordem.valorPago) }];
  if (ordem.status === "PERDEU") {
    return { ...escada, degraus, fim: "CAIU" };
  }
  if (ordem.status === "EMPATOU") {
    return { ...escada, degraus };
  }
  const vitorias = degraus.filter((d) => d.status === "GANHOU").length;
  const premio = Number(ordem.valorPago);
  if (vitorias >= DEGRAUS_ESCADA) {
    return { ...escada, degraus, valorAtual: premio, fim: "TOPO" };
  }
  return { ...escada, degraus, valorAtual: Math.min(premio, valorMaximo) };
}

export function sacarEscada(escada) {
  return { ...escada, fim: "SACOU" };
}
