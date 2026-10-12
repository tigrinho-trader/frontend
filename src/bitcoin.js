// Pássaro bitcoin: a altura do voo acompanha a cotação do BTC em tempo real, recebida direto da Binance
// (WebSocket público de dados de mercado, sem chave). Quando o preço sobe, o pássaro sobe; quando cai, desce.
// Reserva: sem mensagens da Binance, consulta a cotação do market-data-service (GET /api/cotacoes/BTCUSDT);
// sem nenhuma das duas, o preço vira um passeio aleatório marcado como "simulado", para o jogo não parar.
import { clamp } from './regras.js';

export const BTC_SIMBOLO = 'BTCUSDT';
// aggTrade: cada negociação (o preço ao vivo); miniTicker: a cada segundo, com a abertura de 24 h
export const BINANCE_WS = 'wss://data-stream.binance.vision/stream?streams=btcusdt@aggTrade/btcusdt@miniTicker';
export const BTC_NASCE_A_CADA = 3;        // segundos entre um pássaro bitcoin e o próximo
export const BTC_MAX_VOANDO = 5;          // teto de pássaros bitcoin na tela ao mesmo tempo
export const BTC_JANELA = 60;             // segundos de histórico usados para medir a oscilação recente
export const BTC_AMPLITUDE = 200;         // px de altura que a oscilação recente ocupa na tela
export const BTC_FAIXA_MINIMA = 0.0002;   // 0,02% do preço: oscilação mínima (não amplia ruído de centavos)
export const BTC_ALTURA = { min: 70, max: 440 };
export const BTC_PRECO_SIMULADO = 100000; // ponto de partida quando nunca houve cotação real
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
  if (!passaro?.btc) return false;
  return direcao === 'ALTA' ? passaro.y < FLECHA_BTC.nivel : passaro.y > FLECHA_BTC.nivel;
}

/** A flecha bitcoin, ao chegar no alvo, acerta este pássaro? */
export function acertaNoAlvo(alvo, passaro) {
  return !!passaro.btc && Math.hypot(passaro.x - alvo.x, passaro.y - alvo.y) <= passaro.type.r + FLECHA_BTC.raio;
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
 * Cotação do BTC para o jogo. Sem timers: o jogo chama `atualizar(dt)` a cada quadro, que (re)conecta a
 * Binance, usa a reserva quando ela se cala e desliza o preço mostrado até o último preço, sem saltos.
 * `geracao` muda quando o preço salta (simulado ⇄ real): quem guardou um preço de referência deve renová-lo.
 *
 * @param {object} deps
 * @param {() => Promise<{preco, variacaoPercentual24h}>} deps.buscarReserva cotação do market-data-service
 * @param {(url: string) => WebSocket} [deps.abrirSocket] abre o WebSocket (troca nos testes)
 * @param {() => number} [deps.aleatorio]
 */
export function criarFeedBtc({ buscarReserva, abrirSocket = url => new WebSocket(url), aleatorio = Math.random }) {
  const f = {
    alvo: null, exibido: null, variacao24h: null, simulado: false, geracao: 0, fonte: null,
    historico: [], t: 0, ultimaBinance: -Infinity, proximaConsulta: 0, buscando: false, falhas: 0,
    ligado: false, socket: null, proximaConexao: 0,
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
      socket = abrirSocket(BINANCE_WS);
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
        if (f.alvo === null) saltar(BTC_PRECO_SIMULADO);
      }
    } finally {
      f.buscando = false;
    }
  }

  return {
    /** Começa a ouvir a Binance (chamado quando a rodada está em andamento). */
    ligar() {
      f.ligado = true;
    },
    /** Fecha a conexão com a Binance (fora da rodada não precisa de cotação). */
    desligar() {
      f.ligado = false;
      const socket = f.socket;
      f.socket = null;
      if (socket) socket.close();
    },
    /** Avança o relógio, cuida da conexão e da reserva e desliza o preço mostrado até o último preço. */
    atualizar(dt) {
      f.t += dt;
      if (f.ligado && !f.socket && f.t >= f.proximaConexao) conectar();
      const binanceCalada = f.t - f.ultimaBinance > SILENCIO_BINANCE;
      if (f.ligado && binanceCalada && !f.buscando && f.t >= f.proximaConsulta) {
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
const NEUTRO_DOLARES = 0.5;   // mirou na linha de agora: sem direção, sem operação

/** 'ALTA', 'QUEDA' ou null (previsão em cima da linha de agora). */
export function direcaoDaPrevisao(previsao) {
  if (!previsao || !Number.isFinite(previsao.previsto) || !Number.isFinite(previsao.agora)) return null;
  const delta = previsao.previsto - previsao.agora;
  if (Math.abs(delta) < NEUTRO_DOLARES) return null;
  return delta > 0 ? 'ALTA' : 'QUEDA';
}

const reais = v => {
  const casas = Math.abs(v) > 0 && Math.abs(v) < 0.01 ? 4 : 2;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}R$ ${Math.abs(v).toLocaleString('pt-BR',
    { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
};

/**
 * Texto curto para o jogador sobre a operação feita com a previsão dele, ou null enquanto ela não termina.
 * `cor`: 'ganho' | 'perda' | 'neutro'.
 */
export function textoResultadoEstudo(op) {
  if (!op) return null;
  const tipo = op.modo === 'REAL' ? 'Operação real' : 'Simulação';
  if (op.status === 'FECHADA' && op.tipo === 'BINARIA') {
    // o jogador vê o placar da aposta binária; a operação na margem fica no detalhe
    const binario = Number(op.resultadoBinarioBrl) || 0;
    const liquido = Number(op.resultadoLiquidoBrl) || 0;
    return {
      texto: `Aposta binária: ${reais(binario)}`,
      detalhe: `${binario > 0 ? 'acertou' : binario < 0 ? 'errou' : 'empatou'} · ${tipo.toLowerCase()} ${reais(liquido)}`,
      cor: binario > 0 ? 'ganho' : binario < 0 ? 'perda' : 'neutro',
    };
  }
  if (op.status === 'FECHADA') {
    const liquido = Number(op.resultadoLiquidoBrl) || 0;
    return {
      texto: `${tipo}: ${reais(liquido)}`,
      detalhe: `previsão ${op.acertouDirecao ? 'certa' : 'errada'} · ${op.direcao === 'ALTA' ? 'alta' : 'queda'}`,
      cor: liquido > 0 ? 'ganho' : liquido < 0 ? 'perda' : 'neutro',
    };
  }
  if (op.status === 'RECUSADA') return { texto: 'Sem operação', detalhe: op.motivo || '', cor: 'neutro' };
  if (op.status === 'FALHOU') return { texto: `${tipo} não concluída`, detalhe: op.motivo || '', cor: 'neutro' };
  return null;
}
