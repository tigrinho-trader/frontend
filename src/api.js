// Cliente HTTP do api-gateway (/api). Põe o access token do login (OIDC) em cada chamada,
// lê os erros em ProblemDetail e avisa o app quando a sessão expira (401) ou a conta
// está bloqueada (403).

/** Erro de uma chamada à API. status 0 = sem conexão. */
export class ErroApi extends Error {
  constructor(status, mensagem, corpo = null) {
    super(mensagem);
    this.name = 'ErroApi';
    this.status = status;
    this.mensagem = mensagem;
    this.corpo = corpo;
  }
}

const MENSAGENS_PADRAO = {
  400: 'Requisição inválida.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Acesso negado.',
  404: 'Não encontrado.',
  409: 'Conflito com o estado atual.',
  422: 'Operação não permitida.',
  429: 'Muitas requisições seguidas. Tente de novo.',
};
export const SEM_CONEXAO = 'Sem conexão com o servidor';

export function mensagemPadrao(status) {
  return MENSAGENS_PADRAO[status] || (status >= 500 ? 'Servidor indisponível. Tente de novo em instantes.' : `Erro ${status}.`);
}

const configuracaoInicial = () => ({
  base: '/api',
  obterToken: null,            // async () => string
  aoNaoAutorizado: null,       // (erro) => void — 401: voltar ao login
  aoContaBloqueada: null,      // (erro) => void — 403 de conta bloqueada/excluída
  fetch: (...args) => globalThis.fetch(...args),
});
let config = configuracaoInicial();

/** Liga a API ao login e aos ganchos do app. Sem argumentos, volta ao padrão (útil nos testes). */
export function configurarApi(opcoes) {
  config = opcoes ? { ...config, ...opcoes } : configuracaoInicial();
}

const ROTAS_ADMIN = /^\/usuarios(?!\/me(?:$|\?))/;

/** 403 que significa conta bloqueada/excluída (e não "você não é admin"). */
export function ehContaBloqueada(erro, caminho = '') {
  if (!(erro instanceof ErroApi) || erro.status !== 403) return false;
  return /bloquead|exclu[ií]d/i.test(erro.mensagem) || !ROTAS_ADMIN.test(caminho);
}

async function lerCorpo(resposta) {
  if (resposta.status === 204) return null;
  const texto = await resposta.text();
  if (!texto) return null;
  const tipo = resposta.headers?.get?.('content-type') || '';
  if (tipo.includes('json') || /^[[{]/.test(texto.trim())) {
    try { return JSON.parse(texto); } catch { /* corpo inválido: trata como texto */ }
  }
  return texto;
}

function mensagemDoCorpo(corpo, status) {
  if (corpo && typeof corpo === 'object') {
    const m = corpo.detail || corpo.title || corpo.mensagem || corpo.message || corpo.error;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  if (typeof corpo === 'string' && corpo.trim() && corpo.length <= 200 && !corpo.includes('<')) return corpo.trim();
  return mensagemPadrao(status);
}

function falhar(erro, caminho) {
  if (erro.status === 401) config.aoNaoAutorizado?.(erro);
  else if (ehContaBloqueada(erro, caminho)) config.aoContaBloqueada?.(erro);
  throw erro;
}

/** Faz uma chamada a {base}{caminho}. `publico` = não manda token. */
export async function requisitar(metodo, caminho, { corpo, publico = false } = {}) {
  const cabecalhos = { Accept: 'application/json' };
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

  if (!publico) {
    let token;
    try {
      token = config.obterToken ? await config.obterToken() : null;
    } catch {
      token = null;
    }
    if (!token) return falhar(new ErroApi(401, mensagemPadrao(401)), caminho);
    cabecalhos.Authorization = `Bearer ${token}`;
  }

  let resposta;
  try {
    resposta = await config.fetch(config.base + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi(0, SEM_CONEXAO);
  }

  let dados;
  try {
    dados = await lerCorpo(resposta);
  } catch {
    dados = null;
  }
  if (!resposta.ok) return falhar(new ErroApi(resposta.status, mensagemDoCorpo(dados, resposta.status), dados), caminho);
  return dados;
}

const id = v => encodeURIComponent(String(v));

function consulta(parametros) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(parametros)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------------------
// user-service
// ---------------------------------------------------------------------------
export const meuPerfil = () => requisitar('GET', '/usuarios/me');
export const atualizarApelido = apelido => requisitar('PATCH', '/usuarios/me', { corpo: { apelido } });
export const excluirConta = () => requisitar('DELETE', '/usuarios/me');

export const listarUsuarios = ({ busca, status, papel, pagina = 0, tamanho = 20 } = {}) =>
  requisitar('GET', '/usuarios' + consulta({ busca: busca?.trim(), status, papel, pagina, tamanho }));
export const alterarStatus = (usuarioId, status, motivo) =>
  requisitar('PATCH', `/usuarios/${id(usuarioId)}/status`, { corpo: motivo ? { status, motivo } : { status } });
export const alterarPapel = (usuarioId, papel) =>
  requisitar('PATCH', `/usuarios/${id(usuarioId)}/papel`, { corpo: { papel } });

// ---------------------------------------------------------------------------
// wallet-service
// ---------------------------------------------------------------------------
export const carteira = () => requisitar('GET', '/carteira');
export const extrato = () => requisitar('GET', '/carteira/extrato');
export const sacarMoedas = moedas => requisitar('POST', '/carteira/saques', { corpo: { valor: moedas } });
/** Compra de moedas. Hoje é o pagamento de teste (sandbox) da carteira; depois, Pix. */
export const comprarMoedas = valor => requisitar('POST', '/carteira/depositos', { corpo: { valor } });
/** Compra por Pix (AbacatePay): configuração da loja, nova cobrança, status e simulação (só em modo de teste). */
export const configCompras = () => requisitar('GET', '/carteira/compras/config');
export const iniciarCompraPix = moedas => requisitar('POST', '/carteira/compras', { corpo: { moedas } });
export const consultarCompraPix = compraId => requisitar('GET', `/carteira/compras/${id(compraId)}`);
export const simularPagamentoPix = compraId => requisitar('POST', `/carteira/compras/${id(compraId)}/simular-pagamento`);

// ---------------------------------------------------------------------------
// trading-service: sessões do Flecha Certeira
// ---------------------------------------------------------------------------
export const cotacao = simbolo => requisitar('GET', `/cotacoes/${encodeURIComponent(simbolo)}`, { publico: true });

// Uma unica conexao SSE por aba; o market-data-service distribui a mesma cotacao para todos os clientes.
let streamCotacoes = null;
const ouvintesCotacoes = new Map();
let assinantesCotacoes = 0;

function iniciarStreamCotacoes() {
  if (streamCotacoes || typeof EventSource === 'undefined') return;
  streamCotacoes = new EventSource(`${config.base}/cotacoes/stream`);
  streamCotacoes.addEventListener('cotacao', evento => {
    let cotacao;
    try { cotacao = JSON.parse(evento.data); } catch { return; }
    ouvintesCotacoes.get(cotacao?.simbolo)?.forEach(ouvinte => ouvinte(cotacao));
  });
  streamCotacoes.onerror = () => {
    // EventSource reconecta sozinho. Os feeds mantêm a ultima cotacao durante a queda.
  };
}

export function assinarCotacao(simbolo, ouvinte) {
  if (typeof EventSource === 'undefined') return () => {};
  const lista = ouvintesCotacoes.get(simbolo) || new Set();
  lista.add(ouvinte);
  ouvintesCotacoes.set(simbolo, lista);
  assinantesCotacoes++;
  iniciarStreamCotacoes();
  return () => {
    lista.delete(ouvinte);
    if (!lista.size) ouvintesCotacoes.delete(simbolo);
    assinantesCotacoes--;
    if (assinantesCotacoes <= 0 && streamCotacoes) {
      streamCotacoes.close();
      streamCotacoes = null;
      assinantesCotacoes = 0;
    }
  };
}
export const aljavaGuardada = () => requisitar('GET', '/jogos/flecha/aljava');
export const meusAcertos = sessaoId =>
  requisitar('GET', '/jogos/flecha/estudo/meus-acertos' + consulta({ sessaoId }));
export const registrarOperacaoEstudo = dados => requisitar('POST', '/jogos/flecha/estudo/operacoes', { corpo: dados });
export const operacaoEstudo = idOperacao => requisitar('GET', `/jogos/flecha/estudo/operacoes/${id(idOperacao)}`);
export const regrasFlecha = () => requisitar('GET', '/jogos/flecha/regras', { publico: true });
/** Sessão ABERTA do usuário, ou null (204). */
export const sessaoAtual = () => requisitar('GET', '/jogos/flecha/sessoes/atual');
export const abrirSessao = (campo, flechas) => requisitar('POST', '/jogos/flecha/sessoes', { corpo: { campo, flechas } });
export const registrarTiro = (sessaoId, flecha, acertos) =>
  requisitar('POST', `/jogos/flecha/sessoes/${id(sessaoId)}/tiros`, { corpo: { flecha, acertos } });
export const comprarFlechas = (sessaoId, flecha, quantidade) =>
  requisitar('POST', `/jogos/flecha/sessoes/${id(sessaoId)}/flechas`, { corpo: { flecha, quantidade } });
export const encerrarSessao = sessaoId => requisitar('POST', `/jogos/flecha/sessoes/${id(sessaoId)}/encerrar`);
