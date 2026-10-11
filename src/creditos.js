// Compra de moedas: pacotes e textos da tela "Comprar moedas".
// Hoje a compra usa o pagamento de teste (sandbox) da carteira: credita na hora, sem cobrar nada.
// Quando o Pix entrar, só a etapa de pagamento muda; os pacotes continuam os mesmos.
import { escaparHtml, formatarMoedas, mensagemErro } from './telas.js';

/** Pacotes à venda. O sandbox da carteira aceita até 5.000 moedas por compra. */
export const PACOTES = [
  { id: 'punhado', nome: 'Punhado', moedas: 100 },
  { id: 'saco', nome: 'Saco', moedas: 500 },
  { id: 'bau', nome: 'Baú', moedas: 1000, destaque: 'Mais escolhido' },
  { id: 'tesouro', nome: 'Tesouro', moedas: 5000 },
];

export const PACOTE_POR_ID = Object.fromEntries(PACOTES.map(p => [p.id, p]));

/** Cartões dos pacotes; o selecionado fica marcado. */
export function htmlPacotes(pacotes = PACOTES, selecionadoId = null) {
  return pacotes.map(p => `
    <button type="button" class="pacote${p.id === selecionadoId ? ' selecionado' : ''}" data-pacote="${escaparHtml(p.id)}"
            aria-pressed="${p.id === selecionadoId}">
      ${p.destaque ? `<span class="pacote-destaque">${escaparHtml(p.destaque)}</span>` : ''}
      <span class="pacote-moedas"><span class="coin"></span>${formatarMoedas(p.moedas)}</span>
      <span class="pacote-nome">${escaparHtml(p.nome)}</span>
    </button>`).join('');
}

/** Mensagem amigável para erros da compra. */
export function mensagemErroCompra(erro) {
  if (erro?.status === 422 && /desabilitad/i.test(erro.mensagem || '')) {
    return 'A compra de moedas está desligada no momento. Tente mais tarde.';
  }
  if (erro?.status === 422) return `Compra recusada: ${mensagemErro(erro)}`;
  return `Não foi possível concluir a compra: ${mensagemErro(erro)}`;
}
