// Textos e trechos de HTML das telas de conta (menu, perfil, administração).
// Tudo puro (sem DOM), para poder ser testado. Todo dado vindo do servidor passa
// por escaparHtml antes de entrar num innerHTML.

export const APELIDO_REGEX = /^[\p{L}\p{N}_]{3,20}$/u;

export const ROTULO_PAPEL = { JOGADOR: 'Jogador', ADMIN: 'Administrador' };
export const ROTULO_STATUS = { ATIVO: 'Ativo', BLOQUEADO: 'Bloqueado', EXCLUIDO: 'Excluído' };
export const ROTULO_TRANSACAO = {
  BONUS_INICIAL: 'Bônus inicial',
  DEPOSITO: 'Depósito',
  SAQUE: 'Saque',
  GANHO_RODADA: 'Ganho na rodada',
  PERDA_RODADA: 'Perda na rodada',
  EMPATE_RODADA: 'Empate na rodada',
};

const rotulo = (mapa, chave) => mapa[chave] || chave || '—';

export function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Só aceita fotos http(s) — evita javascript: e data: vindos do servidor. */
export function urlSegura(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : '';
}

const fmtMoedas = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** 1234.5 → "1.234,5"; valores inválidos viram "0". */
export function formatarMoedas(valor) {
  const n = Number(valor);
  return fmtMoedas.format(Number.isFinite(n) ? n : 0);
}

/** Com sinal: "+15", "−8" (sinal de menos tipográfico), "0". */
export function formatarComSinal(valor) {
  const n = Number(valor) || 0;
  if (n > 0) return '+' + formatarMoedas(n);
  if (n < 0) return '−' + formatarMoedas(-n);
  return '0';
}

export const classeSinal = valor => (Number(valor) > 0 ? 'pos' : Number(valor) < 0 ? 'neg' : '');

/** "11/10/2026 14:03" (ou "—" sem data). */
export function formatarDataHora(iso, timeZone) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone,
  }).format(d).replace(',', '');
}

/** "11/10/2026" (ou "—" sem data). */
export function formatarData(iso, timeZone) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(d);
}

/** null se o apelido é válido; senão a mensagem para o jogador. */
export function validarApelido(apelido) {
  const v = (apelido ?? '').trim();
  if (v.length < 3) return 'O apelido precisa ter pelo menos 3 caracteres.';
  if (v.length > 20) return 'O apelido pode ter no máximo 20 caracteres.';
  if (!APELIDO_REGEX.test(v)) return 'Use só letras, números e _ (sem espaços).';
  return null;
}

/** Nome para exibir: apelido, nome, email ou "Jogador". */
export const nomeExibicao = u => u?.apelido || u?.nome || u?.email || 'Jogador';

/** Até 2 iniciais para o avatar sem foto. */
export function iniciais(texto) {
  const partes = String(texto || '').trim().split(/[\s_.@-]+/u).filter(Boolean);
  if (!partes.length) return '?';
  return partes.slice(0, 2).map(p => [...p][0].toUpperCase()).join('');
}

// ---------------------------------------------------------------------------
// Perfil: últimas movimentações da carteira
// ---------------------------------------------------------------------------
export function htmlExtrato(transacoes, limite = 10, timeZone) {
  const lista = Array.isArray(transacoes) ? transacoes.slice(0, limite) : [];
  if (!lista.length) return '<tr><td colspan="4" class="vazio">Nenhuma movimentação ainda.</td></tr>';
  return lista.map(t => `
    <tr>
      <td>${escaparHtml(rotulo(ROTULO_TRANSACAO, t.tipo))}</td>
      <td class="valor ${classeSinal(t.valor)}">${formatarComSinal(t.valor)}</td>
      <td class="descricao">${escaparHtml(t.descricao || '—')}</td>
      <td class="data">${formatarDataHora(t.criadaEm, timeZone)}</td>
    </tr>`).join('');
}

// ---------------------------------------------------------------------------
// Administração: tabela de usuários
// ---------------------------------------------------------------------------

/** Ações possíveis para um usuário na tabela (o servidor recusa as mesmas com 422). */
export function acoesUsuario(usuario, meuId) {
  if (usuario.id === meuId) return { proprio: true, bloquear: false, desbloquear: false, tornarAdmin: false, tornarJogador: false };
  const excluido = usuario.status === 'EXCLUIDO';
  return {
    proprio: false,
    bloquear: usuario.status === 'ATIVO',
    desbloquear: usuario.status === 'BLOQUEADO',
    tornarAdmin: !excluido && usuario.papel !== 'ADMIN',
    tornarJogador: !excluido && usuario.papel === 'ADMIN',
  };
}

function htmlAcoes(u, meuId, bloqueandoId) {
  const a = acoesUsuario(u, meuId);
  const id = escaparHtml(u.id);
  if (bloqueandoId === u.id && a.bloquear) {
    return `
      <form class="bloqueio" data-acao="confirmar-bloqueio" data-id="${id}">
        <input type="text" name="motivo" maxlength="200" placeholder="Motivo do bloqueio" required aria-label="Motivo do bloqueio">
        <button type="submit" class="mini perigo">Confirmar</button>
        <button type="button" class="mini" data-acao="cancelar-bloqueio" data-id="${id}">Cancelar</button>
      </form>`;
  }
  const dica = a.proprio ? ' title="Você não pode alterar a própria conta"' : '';
  const botao = (acao, texto, ativo, classe = '') =>
    `<button type="button" class="mini ${classe}" data-acao="${acao}" data-id="${id}"${ativo ? '' : ' disabled'}${dica}>${texto}</button>`;
  const botoes = [];
  if (u.status === 'BLOQUEADO') botoes.push(botao('desbloquear', 'Desbloquear', a.desbloquear));
  else botoes.push(botao('bloquear', 'Bloquear', a.bloquear, 'perigo'));
  if (u.papel === 'ADMIN') botoes.push(botao('tornar-jogador', 'Tornar jogador', a.tornarJogador));
  else botoes.push(botao('tornar-admin', 'Tornar admin', a.tornarAdmin));
  return botoes.join('');
}

export function htmlLinhasUsuarios(usuarios, meuId, bloqueandoId = null, timeZone) {
  const lista = Array.isArray(usuarios) ? usuarios : [];
  if (!lista.length) return '<tr><td colspan="6" class="vazio">Nenhum usuário encontrado.</td></tr>';
  return lista.map(u => {
    const nome = u.nome && u.apelido && u.nome !== u.apelido
      ? `<b>${escaparHtml(u.apelido)}</b><small>${escaparHtml(u.nome)}</small>`
      : `<b>${escaparHtml(u.apelido || u.nome || '—')}</b>`;
    const motivo = u.status === 'BLOQUEADO' && u.motivoBloqueio ? ` title="${escaparHtml(u.motivoBloqueio)}"` : '';
    const voce = u.id === meuId ? ' <span class="selo">você</span>' : '';
    return `
      <tr class="${u.id === meuId ? 'eu' : ''}">
        <td class="nome">${nome}${voce}</td>
        <td class="email">${escaparHtml(u.email || '—')}</td>
        <td><span class="papel papel-${escaparHtml(String(u.papel || '').toLowerCase())}">${escaparHtml(rotulo(ROTULO_PAPEL, u.papel))}</span></td>
        <td><span class="status status-${escaparHtml(String(u.status || '').toLowerCase())}"${motivo}>${escaparHtml(rotulo(ROTULO_STATUS, u.status))}</span></td>
        <td class="data">${formatarDataHora(u.ultimoAcessoEm, timeZone)}</td>
        <td class="acoes">${htmlAcoes(u, meuId, bloqueandoId)}</td>
      </tr>`;
  }).join('');
}

/** "Página 2 de 5 · 93 usuários" e se há página anterior/próxima. */
export function paginacao({ total = 0, pagina = 0, tamanho = 20 } = {}) {
  const paginas = Math.max(1, Math.ceil(total / Math.max(1, tamanho)));
  return {
    texto: `Página ${pagina + 1} de ${paginas} · ${total} usuário${total === 1 ? '' : 's'}`,
    anterior: pagina > 0,
    proxima: pagina + 1 < paginas,
  };
}

/** Mensagem do erro para mostrar na tela. */
export function mensagemErro(erro, padrao = 'Algo deu errado. Tente de novo.') {
  return erro?.mensagem || erro?.message || padrao;
}
