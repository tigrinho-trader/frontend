// Compra de moedas: pacotes e textos da tela "Comprar moedas".
// Com o Pix (AbacatePay) configurado na carteira, a compra gera um QR Code e o servidor confirma o
// pagamento com o provedor. Sem Pix, cai no pagamento de teste (sandbox), que credita na hora.
import { escaparHtml, formatarMoedas, mensagemErro } from './telas.js';

/** Pacotes padrão. Com o Pix ligado, a lista oficial vem do servidor (`/carteira/compras/config`). */
export const PACOTES = [
  { id: 'punhado', nome: 'Punhado', moedas: 100 },
  { id: 'saco', nome: 'Saco', moedas: 500 },
  { id: 'bau', nome: 'Baú', moedas: 1000, destaque: 'Mais escolhido' },
  { id: 'tesouro', nome: 'Tesouro', moedas: 5000 },
];

export const PACOTE_POR_ID = Object.fromEntries(PACOTES.map(p => [p.id, p]));

const NOMES = ['Punhado', 'Saco', 'Baú', 'Tesouro', 'Tesouro real', 'Tesouro do rei'];

/** Monta os pacotes a partir das quantidades permitidas pelo servidor (em ordem crescente). */
export function pacotesDoServidor(quantidades) {
  const lista = [...new Set((quantidades || []).map(Number).filter(n => Number.isInteger(n) && n > 0))]
    .sort((a, b) => a - b);
  if (!lista.length) return PACOTES;
  const meio = Math.floor((lista.length - 1) / 2) + (lista.length > 2 ? 1 : 0);
  return lista.map((moedas, i) => ({
    id: `p${moedas}`,
    nome: NOMES[i] || `${formatarMoedas(moedas)} moedas`,
    moedas,
    ...(i === meio && lista.length > 1 ? { destaque: 'Mais escolhido' } : {}),
  }));
}

/** Preço em reais, ex.: 500 moedas a 1 centavo = "R$ 5,00". */
export function precoEmReais(moedas, centavosPorMoeda) {
  const centavos = Math.round(Number(moedas) * Number(centavosPorMoeda));
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Limites quando a carteira não informa: Pix de R$ 1 a R$ 1.000; pagamento de teste até 5.000 moedas. */
export const LIMITES_PADRAO = {
  pix: { minimoMoedas: 10, maximoMoedas: 10000 },
  sandbox: { minimoMoedas: 1, maximoMoedas: 5000 },
};

const reais = valor => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

/** Faixa de valores em reais inteiros que cabe nos limites em moedas. */
export function faixaEmReais({ centavosPorMoeda, minimoMoedas, maximoMoedas }) {
  return {
    min: Math.max(1, Math.ceil((minimoMoedas * centavosPorMoeda) / 100)),
    max: Math.floor((maximoMoedas * centavosPorMoeda) / 100),
  };
}

/** Texto da faixa, ex.: "de R$ 1 a R$ 1.000". */
export function textoFaixa(cfg) {
  const { min, max } = faixaEmReais(cfg);
  return `de ${reais(min)} a ${reais(max)}`;
}

/**
 * Converte o valor digitado (reais inteiros) em moedas. Campo vazio devolve `{ moedas: null }` sem erro;
 * valor inválido devolve `{ moedas: null, erro }`.
 */
export function moedasDoValor(texto, cfg) {
  const limpo = String(texto ?? '').trim().replace(/^R\$\s*/i, '').replace(/\.(?=\d{3}(\D|$))/g, '');
  if (!limpo) return { moedas: null };
  const fora = `Escolha um valor ${textoFaixa(cfg)}.`;
  if (!/^\d+([.,]\d+)?$/.test(limpo)) return { moedas: null, erro: fora };
  const valor = Number(limpo.replace(',', '.'));
  if (!Number.isInteger(valor)) return { moedas: null, erro: 'Use um valor inteiro em reais, sem centavos.' };
  const moedas = Math.floor((valor * 100) / cfg.centavosPorMoeda);
  const { min, max } = faixaEmReais(cfg);
  if (valor < min || valor > max || moedas < cfg.minimoMoedas || moedas > cfg.maximoMoedas) {
    return { moedas: null, erro: fora };
  }
  return { moedas };
}

/** Valor em reais inteiros de uma quantidade de moedas, ou '' se não fechar em reais inteiros. */
export function valorDasMoedas(moedas, centavosPorMoeda) {
  const centavos = Number(moedas) * Number(centavosPorMoeda);
  return Number.isFinite(centavos) && centavos > 0 && centavos % 100 === 0 ? String(centavos / 100) : '';
}

/** Cartões dos pacotes; o selecionado fica marcado. Com `centavosPorMoeda` mostra o preço. */
export function htmlPacotes(pacotes = PACOTES, selecionadoId = null, centavosPorMoeda = null) {
  return pacotes.map(p => `
    <button type="button" class="pacote${p.id === selecionadoId ? ' selecionado' : ''}" data-pacote="${escaparHtml(p.id)}"
            aria-pressed="${p.id === selecionadoId}">
      ${p.destaque ? `<span class="pacote-destaque">${escaparHtml(p.destaque)}</span>` : ''}
      <span class="pacote-moedas"><span class="coin"></span>${formatarMoedas(p.moedas)}</span>
      <span class="pacote-nome">${escaparHtml(p.nome)}</span>
      ${centavosPorMoeda ? `<span class="pacote-preco">${precoEmReais(p.moedas, centavosPorMoeda)}</span>` : ''}
    </button>`).join('');
}

/** Só aceita a imagem do QR Code como data URL PNG (nada de URL externa vinda da resposta). */
export function qrCodeSeguro(dataUrl) {
  return typeof dataUrl === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) ? dataUrl : null;
}

/** "mm:ss" até expirar, ou null se já expirou / não há data. */
export function tempoRestante(expiraEm, agora = Date.now()) {
  const fim = Date.parse(expiraEm || '');
  if (Number.isNaN(fim)) return null;
  const s = Math.floor((fim - agora) / 1000);
  if (s <= 0) return null;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Texto para cada status de compra que encerra a espera. */
export const TEXTO_STATUS_FINAL = {
  EXPIRADA: 'O Pix expirou sem pagamento. Gere um novo para comprar.',
  CANCELADA: 'A cobrança foi cancelada. Gere um novo Pix para comprar.',
  FALHOU: 'O pagamento não foi confirmado. Gere um novo Pix ou tente mais tarde.',
};

/** Mensagem amigável para erros da compra. */
export function mensagemErroCompra(erro) {
  if (erro?.status === 422 && /desabilitad/i.test(erro.mensagem || '')) {
    return 'A compra de moedas está desligada no momento. Tente mais tarde.';
  }
  if (erro?.status === 503) return `O Pix está indisponível agora: ${mensagemErro(erro)}`;
  if (erro?.status === 422) return `Compra recusada: ${mensagemErro(erro)}`;
  return `Não foi possível concluir a compra: ${mensagemErro(erro)}`;
}
