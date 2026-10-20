// Pássaros de mercado (bitcoin, ethereum, ouro): a altura do voo acompanha a cotação em tempo real, recebida
// direto da Binance (WebSocket público de dados de mercado, grátis e sem chave). Quando o preço sobe, o pássaro
// sobe; quando cai, desce. Reserva: sem mensagens da Binance, consulta a cotação do market-data-service
// (GET /api/cotacoes/{simbolo}); sem nenhuma das duas, o preço vira um passeio aleatório marcado como
// "simulado", para o jogo não parar.
import { APOSTA_MERCADO, clamp } from './regras.js';

/**
 * Ativos com pássaro e flecha próprios. `casas`: casas decimais do preço na tela. `nasceACada`: segundos entre um
 * pássaro avulso e o próximo. Só o bitcoin pode operar com dinheiro real (o resto do estudo é simulado).
 */
export const ATIVOS = {
  btc: { id: 'btc', simbolo: 'BTCUSDT', nome: 'Bitcoin', marca: '₿', cor: '#f7931a', casas: 0, nasceACada: 3, precoSimulado: 100000 },
  eth: { id: 'eth', simbolo: 'ETHUSDT', nome: 'Ethereum', marca: 'Ξ', cor: '#627eea', casas: 2, nasceACada: 6, precoSimulado: 3000 },
  ouro: { id: 'ouro', simbolo: 'PAXGUSDT', nome: 'Ouro', marca: 'Au', cor: '#c9a227', casas: 2, nasceACada: 6, precoSimulado: 2600 },
  v100: { id: 'v100', simbolo: '1HZ100V', nome: 'Volatilidade 100', marca: 'V', cor: '#d32f2f', casas: 2, nasceACada: 3, precoSimulado: 1000, provedor: 'deriv' },
};
export const LISTA_ATIVOS = Object.values(ATIVOS);
export const ATIVO_POR_SIMBOLO = Object.fromEntries(LISTA_ATIVOS.map(a => [a.simbolo, a]));

/** Stream combinado da Binance para um par. aggTrade: cada negociação; miniTicker: a cada segundo, com 24 h. */
export function urlBinance(simbolo) {
  const s = simbolo.toLowerCase();
  return `wss://data-stream.binance.vision/stream?streams=${s}@aggTrade/${s}@miniTicker`;
}

export const BTC_SIMBOLO = ATIVOS.btc.simbolo;
export const BINANCE_WS = urlBinance(BTC_SIMBOLO);
export const BTC_NASCE_A_CADA = ATIVOS.btc.nasceACada;   // segundos entre um pássaro bitcoin e o próximo
export const BTC_MAX_VOANDO = 5;          // teto de pássaros bitcoin na tela ao mesmo tempo
export const BTC_JANELA = 60;             // segundos de histórico usados para medir a oscilação recente
export const BTC_AMPLITUDE = 200;         // px de altura que a oscilação recente ocupa na tela
export const BTC_FAIXA_MINIMA = 0.0002;   // 0,02% do preço: oscilação mínima (não amplia ruído de centavos)
export const BTC_ALTURA = { min: 70, max: 440 };
export const BTC_PRECO_SIMULADO = ATIVOS.btc.precoSimulado; // ponto de partida quando nunca houve cotação real
const SILENCIO_BINANCE = 3;               // s sem mensagem da Binance para usar a reserva do servidor
const CONSULTA_RESERVA = 1;               // s entre consultas ao servidor enquanto a Binance está calada
const RECONECTAR_EM = 3;                  // s até tentar a Binance de novo depois de cair
const FALHAS_PARA_SIMULAR = 3;
const PONTO_A_CADA = 0.25;                // s entre pontos do histórico

/** Pixels por dólar: a faixa de preço da janela recente vira BTC_AMPLITUDE px. */
export function escalaBtc(historico, preco) {
  if (!(preco > 0)) return 0;
  let min = preco, max = preco;
  for (const h of historico) {
    if (h.preco < min) min = h.preco;
    if (h.preco > max) max = h.preco;
  }
  return BTC_AMPLITUDE / Math.max(max - min, preco * BTC_FAIXA_MINIMA);
}

/** Altura do pássaro: sobe (y menor) quando o preço sobe em relação ao preço de quando ele nasceu. */
export function alturaBtc(baseY, precoInicial, preco, escala) {
  return clamp(baseY - (preco - precoInicial) * escala, BTC_ALTURA.min, BTC_ALTURA.max);
}

// ---------------------------------------------------------------------------
// Flecha bitcoin: é uma previsão do preço do BTC daqui a FLECHA_BTC.tempo segundos.
// O alvo fica sempre no extremo direito da tela (xAlvo); o jogador escolhe só a altura. No instante em que a
// flecha sai do arco nasce um pássaro bitcoin "da flecha": ele parte da altura do preço de agora (nivel) e
// chega em xAlvo junto com a flecha. Lá, a altura dele é a variação do BTC nesses 5 s: quem mirou na altura
// certa acerta.
// ---------------------------------------------------------------------------
export const FLECHA_BTC = {
  tempo: 5,          // s até o alvo
  g: 40,             // gravidade leve: um arco suave em vez da queda das flechas normais
  xAlvo: 1190,       // coluna do alvo, no extremo direito (tela lógica de 1280 px)
  xNascimento: -60,  // de onde sai o pássaro da flecha (fora da tela, à esquerda)
  nivel: 255,        // altura que representa o preço no instante do disparo
  raio: 10,          // folga do acerto, somada ao raio do pássaro
};

/** Altura mirada: onde a reta do arco cruza a coluna do alvo, dentro da faixa de voo do pássaro. */
export function alvoFlechaBtc(origem, angulo, faixa = BTC_ALTURA) {
  const cos = Math.cos(angulo);
  const y = cos > 0.01
    ? origem.y + Math.tan(angulo) * (FLECHA_BTC.xAlvo - origem.x)
    : Math.sin(angulo) < 0 ? faixa.min : faixa.max;     // apontando para cima/baixo (ou para trás)
  return { x: FLECHA_BTC.xAlvo, y: clamp(y, faixa.min, faixa.max) };
}

/** Velocidade do pássaro da flecha: sai de xNascimento e chega em xAlvo no mesmo instante que a flecha. */
export function velocidadePassaroDaFlecha() {
  return (FLECHA_BTC.xAlvo - FLECHA_BTC.xNascimento) / FLECHA_BTC.tempo;
}

/** Preço que a altura y representa: é o preço que o jogador prevê para daqui a 5 s. */
export function precoPrevisto(precoAgora, escala, y) {
  return escala > 0 ? precoAgora + (FLECHA_BTC.nivel - y) / escala : precoAgora;
}

/** Quantos dólares de erro na previsão ainda acertam o pássaro (raio do acerto convertido em preço). */
export function toleranciaEmDolares(escala, raioPassaro) {
  return escala > 0 ? (raioPassaro + FLECHA_BTC.raio) / escala : 0;
}

/** Velocidade inicial para, com a gravidade da flecha bitcoin, chegar ao alvo em FLECHA_BTC.tempo. */
export function velocidadeFlechaBtc(origem, alvo) {
  const { tempo: t, g } = FLECHA_BTC;
  return { vx: (alvo.x - origem.x) / t, vy: (alvo.y - origem.y - 0.5 * g * t * t) / t };
}

/**
 * Modo binário: a mira escolhe só o lado (acima da linha de agora = sobe, abaixo = desce). A flecha vai para o
 * meio da faixa escolhida.
 */
export function alvoBinario(yMirado, faixa = BTC_ALTURA) {
  const direcao = yMirado < FLECHA_BTC.nivel ? 'ALTA' : 'QUEDA';
  const y = direcao === 'ALTA' ? (faixa.min + FLECHA_BTC.nivel) / 2 : (FLECHA_BTC.nivel + faixa.max) / 2;
  return { x: FLECHA_BTC.xAlvo, y, binaria: direcao };
}

/** Modo binário: acerta o pássaro da flecha se ele chegou do lado escolhido (o preço andou para lá). */
export function acertaBinario(direcao, passaro) {
  if (!passaro?.mercado) return false;
  return direcao === 'ALTA' ? passaro.y < FLECHA_BTC.nivel : passaro.y > FLECHA_BTC.nivel;
}

/**
 * Modo previsão: a flecha de mercado, ao chegar no alvo, acerta este pássaro? Só pássaros do mesmo ativo da
 * flecha (`alvo.ativo`; sem ele, qualquer pássaro de mercado).
 */
export function acertaNoAlvo(alvo, passaro) {
  if (!passaro.mercado || (alvo.ativo && passaro.mercado.ativo !== alvo.ativo)) return false;
  return Math.hypot(passaro.x - alvo.x, passaro.y - alvo.y) <= passaro.type.r + FLECHA_BTC.raio;
}

/** Lê uma mensagem do stream combinado da Binance. Devolve `{ preco, variacao24h? }` ou null. */
export function lerMensagemBinance(texto) {
  let m;
  try {
    m = JSON.parse(texto);
  } catch {
    return null;
  }
  const d = m?.data;
  if (d?.e === 'aggTrade') {
    const preco = Number(d.p);
    return preco > 0 ? { preco } : null;
  }
  if (d?.e === '24hrMiniTicker') {
    const preco = Number(d.c), abertura = Number(d.o);
    return preco > 0 && abertura > 0 ? { preco, variacao24h: ((preco - abertura) / abertura) * 100 } : null;
  }
  return null;
}

/**
 * Cotação de um par para o jogo. Sem timers: o jogo chama `atualizar(dt)` a cada quadro, que (re)conecta a
 * Binance, usa a reserva quando ela se cala e desliza o preço mostrado até o último preço, sem saltos.
 * `geracao` muda quando o preço salta (simulado ⇄ real): quem guardou um preço de referência deve renová-lo.
 *
 * @param {object} deps
 * @param {string} [deps.simbolo] par na Binance (padrão BTCUSDT)
 * @param {number} [deps.precoSimulado] ponto de partida do preço simulado quando nunca houve cotação
 * @param {() => Promise<{preco, variacaoPercentual24h}>} deps.buscarReserva cotação do market-data-service
 * @param {(url: string) => WebSocket} [deps.abrirSocket] abre o WebSocket (troca nos testes)
 * @param {() => number} [deps.aleatorio]
 */
export function criarFeedPreco({
  simbolo = BTC_SIMBOLO, precoSimulado = BTC_PRECO_SIMULADO, buscarReserva,
  abrirSocket = url => new WebSocket(url), assinar, usarBinance = true, aleatorio = Math.random,
}) {
  const url = urlBinance(simbolo);
  const f = {
    alvo: null, exibido: null, variacao24h: null, simulado: false, geracao: 0, fonte: null,
    historico: [], t: 0, ultimaBinance: -Infinity, proximaConsulta: 0, buscando: false, falhas: 0,
    ligado: false, socket: null, proximaConexao: 0, cancelarAssinatura: null,
  };

  function registrar(preco) {
    const ultimo = f.historico[f.historico.length - 1];
    if (ultimo && f.t - ultimo.t < PONTO_A_CADA) ultimo.preco = preco;
    else f.historico.push({ t: f.t, preco });
    while (f.historico.length && f.historico[0].t < f.t - BTC_JANELA) f.historico.shift();
  }

  function saltar(preco) {
    f.alvo = preco;
    f.exibido = preco;
    f.historico = [];
    f.geracao++;
  }

  function receber(cotacao, fonte) {
    const preco = Number(cotacao?.preco);
    if (!(preco > 0)) return false;
    if (f.simulado || f.alvo === null) saltar(preco);
    f.simulado = false;
    f.falhas = 0;
    f.alvo = preco;
    f.fonte = fonte;
    const v = Number(cotacao.variacao24h);
    if (Number.isFinite(v)) f.variacao24h = v;
    registrar(preco);
    return true;
  }

  function conectar() {
    let socket;
    try {
      socket = abrirSocket(url);
    } catch {
      f.proximaConexao = f.t + RECONECTAR_EM;
      return;
    }
    f.socket = socket;
    socket.onmessage = e => {
      if (f.socket === socket && receber(lerMensagemBinance(e.data), 'binance')) f.ultimaBinance = f.t;
    };
    socket.onclose = () => {
      if (f.socket !== socket) return;
      f.socket = null;
      f.proximaConexao = f.t + RECONECTAR_EM;
    };
    socket.onerror = () => socket.close();
  }

  async function consultarReserva() {
    f.buscando = true;
    try {
      const c = await buscarReserva();
      // a Binance pode ter voltado enquanto esperava: ela tem prioridade
      if (f.t - f.ultimaBinance > SILENCIO_BINANCE) {
        if (!receber({ preco: c?.preco, variacao24h: c?.variacaoPercentual24h }, 'servidor')) {
          throw new Error('cotação inválida');
        }
      }
    } catch {
      f.falhas++;
      if (!f.simulado && (f.alvo === null || f.falhas >= FALHAS_PARA_SIMULAR)) {
        f.simulado = true;
        f.fonte = null;
        f.variacao24h = null;
        if (f.alvo === null) saltar(precoSimulado);
      }
    } finally {
      f.buscando = false;
    }
  }

  return {
    /** Começa a ouvir a Binance (chamado quando a rodada está em andamento). */
    ligar() {
      f.ligado = true;
      if (assinar && !f.cancelarAssinatura) {
        f.cancelarAssinatura = assinar(simbolo, cotacao => {
          if (receber(cotacao, 'servidor')) f.ultimaBinance = f.t;
        });
      }
    },
    /** Fecha a conexão com a Binance (fora da rodada não precisa de cotação). */
    desligar() {
      f.ligado = false;
      if (f.cancelarAssinatura) {
        f.cancelarAssinatura();
        f.cancelarAssinatura = null;
      }
      const socket = f.socket;
      f.socket = null;
      if (socket) socket.close();
    },
    /** Avança o relógio, cuida da conexão e da reserva e desliza o preço mostrado até o último preço. */
    atualizar(dt) {
      f.t += dt;
      if (f.ligado && usarBinance && !assinar && !f.socket && f.t >= f.proximaConexao) conectar();
      const binanceCalada = f.t - f.ultimaBinance > SILENCIO_BINANCE;
      if (f.ligado && !assinar && binanceCalada && !f.buscando && f.t >= f.proximaConsulta) {
        f.proximaConsulta = f.t + CONSULTA_RESERVA;
        consultarReserva();
      }
      if (f.simulado) {
        // passeio aleatório: alguns centésimos de % por segundo
        f.alvo *= 1 + (aleatorio() * 2 - 1) * 0.00025 * Math.sqrt(dt);
        registrar(f.alvo);
      }
      if (f.alvo !== null) {
        f.exibido = f.exibido === null ? f.alvo : f.exibido + (f.alvo - f.exibido) * (1 - Math.exp(-dt * 6));
      }
    },
    /** Preço atual (suavizado), ou null antes da primeira cotação. */
    preco: () => f.exibido,
    /** Pixels por dólar para a oscilação recente. */
    escala: () => escalaBtc(f.historico, f.exibido),
    variacao24h: () => f.variacao24h,
    simulado: () => f.simulado,
    /** 'binance' | 'servidor' | null (simulado ou sem cotação ainda). */
    fonte: () => f.fonte,
    geracao: () => f.geracao,
    ligado: () => f.ligado,
  };
}

// ---------------------------------------------------------------------------
// Estudo da sabedoria das massas: cada flecha bitcoin vira uma operação na direção prevista (trading-service).
// ---------------------------------------------------------------------------
const NEUTRO_RELATIVO = 0.000006;   // mirou na linha de agora (~US$ 0,50 no bitcoin): sem direção, sem operação

/** 'ALTA', 'QUEDA' ou null (previsão em cima da linha de agora). */
export function direcaoDaPrevisao(previsao) {
  if (!previsao || !Number.isFinite(previsao.previsto) || !Number.isFinite(previsao.agora)) return null;
  const delta = previsao.previsto - previsao.agora;
  if (Math.abs(delta) < Math.abs(previsao.agora) * NEUTRO_RELATIVO) return null;
  return delta > 0 ? 'ALTA' : 'QUEDA';
}

const reais = v => {
  const casas = Math.abs(v) > 0 && Math.abs(v) < 0.01 ? 4 : 2;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}R$ ${Math.abs(v).toLocaleString('pt-BR',
    { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
};

const fmtMoedasAposta = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Moedas com sinal e centavos: "+0,3", "−0,6", "0". */
export const moedasComSinal = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtMoedasAposta.format(Math.abs(Number(v) || 0))}`;

/**
 * Quanto a aposta liquidada rendeu em moedas: o que o servidor pagou menos as 100 apostadas (0 enquanto não pagou).
 * O servidor paga 100 + 10 × o resultado da operação em reais (R$ 1 = 10 moedas); se a operação não aconteceu, 100.
 */
export function lucroDaAposta(op) {
  if (!op || op.moedasPagas === null || op.moedasPagas === undefined) return 0;
  return Math.round((Number(op.moedasPagas) - APOSTA_MERCADO) * 100) / 100;
}

/**
 * Texto curto para o jogador sobre a aposta da flecha de mercado, ou null enquanto o servidor não liquidou.
 * `cor`: 'ganho' | 'perda' | 'neutro'.
 */
export function textoResultadoEstudo(op) {
  if (!op || op.moedasPagas === null || op.moedasPagas === undefined) return null;
  const lucro = lucroDaAposta(op);
  const nome = ATIVO_POR_SIMBOLO[op.simbolo]?.nome;
  const ativo = nome ? `${nome} · ` : '';
  const cor = lucro > 0 ? 'ganho' : lucro < 0 ? 'perda' : 'neutro';
  if (op.status !== 'FECHADA') {
    return { texto: 'Aposta devolvida', detalhe: `${ativo}${op.motivo || 'operação não aconteceu'}`, cor };
  }
  const texto = `${moedasComSinal(lucro)} moedas`;
  const binario = Number(op.resultadoBinarioBrl) || 0;
  const tipo = op.modo === 'REAL' ? 'operação real' : 'simulação';
  const percentual = Number(op.resultadoPercentual);
  const pct = Number.isFinite(percentual) ? ` · ${percentual >= 0 ? '+' : ''}${percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '';
  return {
    texto,
    detalhe: `${ativo}${binario > 0 ? 'acertou' : binario < 0 ? 'errou' : 'empatou'} · ${tipo}${pct} ${reais(Number(op.resultadoLiquidoBrl) || 0)}`,
    cor,
  };
}

// ---------------------------------------------------------------------------
// Acertos do jogador nas apostas de mercado
// ---------------------------------------------------------------------------
/** Placar de uma partida por ativo: { btc: { acertos, erros, empates }, eth: ..., ouro: ... }. */
export const placarVazio = () => Object.fromEntries(LISTA_ATIVOS.map(a => [a.id, { acertos: 0, erros: 0, empates: 0 }]));

/** Conta uma aposta liquidada (só operações FECHADA decidem; as devolvidas por falha não contam). */
export function contarNoPlacar(placar, ativo, op) {
  if (!op || op.status !== 'FECHADA' || !placar[ativo]) return placar;
  const b = Number(op.resultadoBinarioBrl) || 0;
  placar[ativo][b > 0 ? 'acertos' : b < 0 ? 'erros' : 'empates']++;
  return placar;
}

/** Porcentagem de acerto, com os empates fora da conta; null sem apostas decididas. */
export function taxaDeAcerto({ acertos, erros }) {
  return acertos + erros > 0 ? (acertos * 100) / (acertos + erros) : null;
}

/** Valor em reais com sinal, ex.: "+R$ 0,12" ou "−R$ 0,0042" (centavos de centavo aparecem). */
export const reaisComSinal = v => reais(Number(v) || 0);

/** Soma ao total da partida o resultado em reais da operação feita com a aposta (só as FECHADA). */
export function somarResultadoReais(total, op) {
  return op?.status === 'FECHADA' ? total + (Number(op.resultadoLiquidoBrl) || 0) : total;
}

/** "60%" ou "—" (sem apostas decididas). */
export const textoTaxa = taxa => (taxa === null || taxa === undefined ? '—'
  : `${Number(taxa).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

/** Uma linha por ativo que teve aposta na partida, ex.: "₿ 60% (3/5)". */
export function linhasDoPlacar(placar) {
  return LISTA_ATIVOS
    .map(a => ({ a, p: placar?.[a.id] }))
    .filter(({ p }) => p && p.acertos + p.erros + p.empates > 0)
    .map(({ a, p }) => ({
      ativo: a,
      texto: `${a.marca} ${textoTaxa(taxaDeAcerto(p))} (${p.acertos}/${p.acertos + p.erros})`,
    }));
}

/** Nome antigo: o feed do bitcoin. */
export const criarFeedBtc = deps => criarFeedPreco({ ...deps, simbolo: BTC_SIMBOLO });
