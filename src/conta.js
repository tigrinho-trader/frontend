// Conta do jogador: login (Auth0), menu, "Meu perfil", "Comprar moedas", "Administração" e conta bloqueada.
// Liga a API ao login e decide o que o menu mostra. O jogo em si fica em jogo.js.
import * as auth from './auth.js';
import * as api from './api.js';
import { ErroApi, configurarApi } from './api.js';
import { setState, atualizarCarteira, estadoAtual, saldoAtual, voltarDaCompra } from './jogo.js';
import { PACOTE_POR_ID, htmlPacotes, mensagemErroCompra } from './creditos.js';
import { RANGE_BY_SLUG } from './regras.js';
import {
  ROTULO_PAPEL, escaparHtml, formatarComSinal, formatarData, formatarMoedas, htmlExtrato, htmlLinhasUsuarios, iniciais,
  mensagemErro, nomeExibicao, paginacao, urlSegura, validarApelido,
} from './telas.js';

const $ = id => document.getElementById(id);

let perfil = null;          // UsuarioResponse do user-service
let bloqueado = false;

// ---------------------------------------------------------------------------
// Menu: carregando | anonimo | erro | logado
// ---------------------------------------------------------------------------
function modoMenu(modo) {
  $('menu').dataset.conta = modo;
}

function avisoMenu(texto, tipo = '') {
  const el = $('menu-aviso');
  el.hidden = !texto;
  el.textContent = texto || '';
  el.className = `aviso-menu ${tipo}`;
}

/** Foto da conta ou as iniciais do nome. */
function pintarAvatar(el, usuario) {
  const url = urlSegura(usuario?.avatarUrl || usuario?.picture);
  el.textContent = '';
  if (url) {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    img.addEventListener('error', () => { el.textContent = iniciais(nomeExibicao(usuario)); });
    el.appendChild(img);
  } else {
    el.textContent = iniciais(nomeExibicao(usuario));
  }
}

function mostrarPerfilNoMenu() {
  pintarAvatar($('menu-avatar'), perfil);
  $('menu-apelido').textContent = nomeExibicao(perfil);
  $('btn-admin').hidden = perfil?.papel !== 'ADMIN';
}

// ---------------------------------------------------------------------------
// 401 e 403 vindos de qualquer chamada
// ---------------------------------------------------------------------------
const CHAVE_RELOGIN = 'flecha-certeira-relogin';

/** Evita laço de redirecionamento: só volta ao Auth0 se não voltou há menos de 30 s. */
function podeRelogar() {
  try {
    const ultimo = Number(sessionStorage.getItem(CHAVE_RELOGIN)) || 0;
    if (Date.now() - ultimo < 30_000) return false;
    sessionStorage.setItem(CHAVE_RELOGIN, String(Date.now()));
  } catch { /* sem storage: deixa tentar */ }
  return true;
}

function sessaoExpirada() {
  if (bloqueado) return;
  if (auth.configurado() && podeRelogar()) {
    auth.entrar().catch(() => {});
    return;
  }
  perfil = null;
  $('menu-erro').textContent = 'O servidor recusou seu login (401). Confira se VITE_AUTH0_AUDIENCE é a mesma audiência configurada no api-gateway e entre de novo.';
  modoMenu('erro');
  setState('menu');
}

function contaBloqueada(erro) {
  bloqueado = true;
  const excluida = /exclu[ií]d/i.test(erro?.mensagem || '');
  $('bloqueado-titulo').textContent = excluida ? 'Conta excluída' : 'Conta bloqueada';
  $('bloqueado-texto').textContent = excluida
    ? 'Esta conta foi excluída e não pode mais ser usada.'
    : 'Um administrador bloqueou sua conta. Enquanto ela estiver bloqueada, não é possível jogar.';
  const motivo = perfil?.motivoBloqueio;
  $('bloqueado-motivo').textContent = motivo ? `Motivo: ${motivo}` : (erro?.mensagem || '');
  setState('bloqueado');
}

async function sair() {
  try { sessionStorage.removeItem(CHAVE_RELOGIN); } catch { /* sem storage */ }
  try {
    await auth.sair();
  } catch {
    window.location.reload();
  }
}

// ---------------------------------------------------------------------------
// Início: login → perfil → carteira → sessão que ficou aberta
// ---------------------------------------------------------------------------
async function carregarConta() {
  modoMenu('carregando');
  avisoMenu('');
  try {
    perfil = await api.meuPerfil();      // cria o usuário no primeiro acesso
  } catch (e) {
    if (e.status === 403) return contaBloqueada(e);
    if (e.status === 401) return;        // sessaoExpirada já cuidou
    $('menu-erro').textContent = `Não foi possível carregar sua conta: ${mensagemErro(e)}.`;
    modoMenu('erro');
    return;
  }
  try { sessionStorage.removeItem(CHAVE_RELOGIN); } catch { /* sem storage */ }
  mostrarPerfilNoMenu();
  modoMenu('logado');
  try {
    await atualizarCarteira();
  } catch (e) {
    if (e.status !== 401 && e.status !== 403) avisoMenu(`Saldo indisponível: ${mensagemErro(e)}.`, 'erro');
  }
  await encerrarRodadaPendente();
}

/** Se a página fechou no meio de uma rodada, encerra a sessão aberta e avisa o resultado. */
async function encerrarRodadaPendente() {
  try {
    const aberta = await api.sessaoAtual();
    if (!aberta) return;
    const final = await api.encerrarSessao(aberta.id);
    const campo = RANGE_BY_SLUG[final?.campo]?.name || 'campo de tiro';
    avisoMenu(`Sua rodada anterior (${campo}) foi encerrada e acertada na carteira: ${formatarComSinal(final?.resultado)} moedas.`);
    setTimeout(() => atualizarCarteira().catch(() => {}), 1500);
  } catch (e) {
    if (e.status !== 401 && e.status !== 403) {
      avisoMenu(`Não foi possível conferir rodadas abertas: ${mensagemErro(e)}.`, 'erro');
    }
  }
}

export async function iniciarConta() {
  configurarApi({
    obterToken: () => auth.token(),
    aoNaoAutorizado: sessaoExpirada,
    aoContaBloqueada: contaBloqueada,
  });

  if (!auth.configurado()) {
    $('aviso-config').hidden = false;
    $('btn-entrar').disabled = true;
    $('btn-criar-conta').disabled = true;
    modoMenu('anonimo');
    return;
  }

  let resultado;
  try {
    resultado = await auth.iniciar();
  } catch (e) {
    avisoMenu(`Não foi possível iniciar o login: ${mensagemErro(e)}`, 'erro');
    modoMenu('anonimo');
    return;
  }
  if (resultado.erro) avisoMenu(`Login não concluído: ${resultado.erro}`, 'erro');
  if (!resultado.autenticado) {
    modoMenu('anonimo');
    return;
  }
  await carregarConta();
}

// ---------------------------------------------------------------------------
// Meu perfil
// ---------------------------------------------------------------------------
function msg(id, texto, tipo = '') {
  const el = $(id);
  el.textContent = texto || '';
  el.className = `msg ${tipo}`;
}

function preencherPerfil() {
  pintarAvatar($('perfil-avatar'), perfil);
  $('perfil-nome').textContent = perfil?.nome || nomeExibicao(perfil);
  $('perfil-email').textContent = perfil?.email || 'sem email';
  $('perfil-papel').textContent = ROTULO_PAPEL[perfil?.papel] || perfil?.papel || '—';
  $('perfil-desde').textContent = formatarData(perfil?.criadoEm);
  $('perfil-apelido').value = perfil?.apelido || '';
}

function fecharExclusao() {
  $('form-excluir').hidden = true;
  $('btn-excluir').hidden = false;
  $('excluir-texto').value = '';
  $('btn-excluir-confirmar').disabled = true;
  msg('excluir-msg', '');
}

async function abrirPerfil() {
  preencherPerfil();
  msg('perfil-apelido-msg', '');
  fecharExclusao();
  $('perfil-extrato').innerHTML = '<tr><td colspan="4" class="vazio">Carregando…</td></tr>';
  setState('perfil');

  // Atualiza os dados e o extrato em paralelo
  const [eu, transacoes] = await Promise.allSettled([api.meuPerfil(), api.extrato()]);
  if (estadoAtual() !== 'perfil') return;
  if (eu.status === 'fulfilled') {
    perfil = eu.value;
    preencherPerfil();
    mostrarPerfilNoMenu();
  }
  $('perfil-extrato').innerHTML = transacoes.status === 'fulfilled'
    ? htmlExtrato(transacoes.value, 10)
    : `<tr><td colspan="4" class="vazio erro">${escaparHtml(mensagemErro(transacoes.reason))}</td></tr>`;
}

async function salvarApelido(e) {
  e.preventDefault();
  const apelido = $('perfil-apelido').value.trim();
  const invalido = validarApelido(apelido);
  if (invalido) return msg('perfil-apelido-msg', invalido, 'erro');
  if (apelido === perfil?.apelido) return msg('perfil-apelido-msg', 'Esse já é o seu apelido.');

  const btn = $('btn-salvar-apelido');
  btn.disabled = true;
  msg('perfil-apelido-msg', 'Salvando…');
  try {
    perfil = await api.atualizarApelido(apelido);
    preencherPerfil();
    mostrarPerfilNoMenu();
    msg('perfil-apelido-msg', 'Apelido atualizado!', 'ok');
  } catch (erro) {
    if (erro.status === 409) msg('perfil-apelido-msg', 'Esse apelido já está em uso. Escolha outro.', 'erro');
    else if (erro.status !== 401 && erro.status !== 403) msg('perfil-apelido-msg', mensagemErro(erro), 'erro');
  } finally {
    btn.disabled = false;
  }
}

async function excluirConta(e) {
  e.preventDefault();
  if ($('excluir-texto').value.trim() !== 'EXCLUIR') return;
  const btn = $('btn-excluir-confirmar');
  btn.disabled = true;
  msg('excluir-msg', 'Excluindo…');
  try {
    await api.excluirConta();
    msg('excluir-msg', 'Conta excluída. Saindo…', 'ok');
    await sair();
  } catch (erro) {
    btn.disabled = false;
    if (erro.status !== 401 && erro.status !== 403) msg('excluir-msg', mensagemErro(erro), 'erro');
  }
}

// ---------------------------------------------------------------------------
// Comprar moedas
// ---------------------------------------------------------------------------
const creditos = { selecionado: null, voltarPara: 'menu', comprando: false };

function desenharCreditos() {
  $('creditos-saldo').textContent = formatarMoedas(saldoAtual());
  $('creditos-pacotes').innerHTML = htmlPacotes(undefined, creditos.selecionado);
  const pacote = PACOTE_POR_ID[creditos.selecionado];
  $('creditos-confirmar').hidden = !pacote;
  if (pacote) $('creditos-qtd').textContent = formatarMoedas(pacote.moedas);
  $('btn-creditos-pagar').disabled = creditos.comprando;
}

/** Abre a loja de moedas lembrando a tela de onde o jogador veio. */
function abrirCreditos(voltarPara = 'menu') {
  creditos.voltarPara = voltarPara;
  creditos.selecionado = null;
  msg('creditos-msg', '');
  desenharCreditos();
  setState('creditos');
}

async function comprarPacote() {
  const pacote = PACOTE_POR_ID[creditos.selecionado];
  if (!pacote || creditos.comprando) return;
  creditos.comprando = true;
  desenharCreditos();
  msg('creditos-msg', 'Processando…');
  try {
    await api.comprarMoedas(pacote.moedas);
    await atualizarCarteira().catch(() => {});
    creditos.selecionado = null;
    msg('creditos-msg', `Pronto! ${formatarMoedas(pacote.moedas)} moedas entraram na sua carteira.`, 'ok');
  } catch (erro) {
    if (erro.status !== 401 && erro.status !== 403) msg('creditos-msg', mensagemErroCompra(erro), 'erro');
  } finally {
    creditos.comprando = false;
    if (estadoAtual() === 'creditos') desenharCreditos();
  }
}

// ---------------------------------------------------------------------------
// Administração
// ---------------------------------------------------------------------------
const admin = { pagina: 0, tamanho: 20, itens: [], total: 0, bloqueandoId: null, carregando: false, pedido: 0 };

function filtrosAdmin() {
  return {
    busca: $('admin-busca').value,
    status: $('admin-status').value,
    papel: $('admin-papel').value,
    pagina: admin.pagina,
    tamanho: admin.tamanho,
  };
}

function desenharAdmin() {
  $('admin-linhas').innerHTML = htmlLinhasUsuarios(admin.itens, perfil?.id, admin.bloqueandoId);
  const p = paginacao({ total: admin.total, pagina: admin.pagina, tamanho: admin.tamanho });
  $('admin-pagina').textContent = p.texto;
  $('admin-anterior').disabled = !p.anterior || admin.carregando;
  $('admin-proxima').disabled = !p.proxima || admin.carregando;
  const campo = $('admin-linhas').querySelector('input[name="motivo"]');
  if (campo) campo.focus();
}

async function carregarUsuarios() {
  const pedido = ++admin.pedido;      // ignora respostas de buscas antigas
  admin.carregando = true;
  msg('admin-erro', '');
  if (!admin.itens.length) $('admin-linhas').innerHTML = '<tr><td colspan="6" class="vazio">Carregando…</td></tr>';
  try {
    const r = await api.listarUsuarios(filtrosAdmin());
    if (pedido !== admin.pedido) return;
    admin.itens = r?.itens || [];
    admin.total = Number(r?.total) || 0;
    admin.bloqueandoId = null;
  } catch (erro) {
    if (pedido !== admin.pedido) return;
    if (erro.status !== 401) msg('admin-erro', mensagemErro(erro), 'erro');
  } finally {
    if (pedido === admin.pedido) {
      admin.carregando = false;
      desenharAdmin();
    }
  }
}

function abrirAdmin() {
  admin.pagina = 0;
  admin.itens = [];
  admin.bloqueandoId = null;
  setState('admin');
  carregarUsuarios();
}

/** Troca o usuário na lista pela versão que o servidor devolveu. */
function substituirUsuario(atualizado) {
  if (!atualizado?.id) return;
  admin.itens = admin.itens.map(u => (u.id === atualizado.id ? atualizado : u));
}

async function executarAcao(acao, id, motivo) {
  const usuario = admin.itens.find(u => u.id === id);
  if (!usuario || id === perfil?.id) return;
  msg('admin-erro', '');
  try {
    let atualizado;
    if (acao === 'confirmar-bloqueio') atualizado = await api.alterarStatus(id, 'BLOQUEADO', motivo);
    else if (acao === 'desbloquear') atualizado = await api.alterarStatus(id, 'ATIVO');
    else if (acao === 'tornar-admin') atualizado = await api.alterarPapel(id, 'ADMIN');
    else if (acao === 'tornar-jogador') atualizado = await api.alterarPapel(id, 'JOGADOR');
    else return;
    admin.bloqueandoId = null;
    substituirUsuario(atualizado);
    const nome = nomeExibicao(atualizado || usuario);
    const textos = {
      'confirmar-bloqueio': `${nome} foi bloqueado.`,
      desbloquear: `${nome} foi desbloqueado.`,
      'tornar-admin': `${nome} agora é administrador.`,
      'tornar-jogador': `${nome} agora é jogador.`,
    };
    msg('admin-erro', textos[acao], 'ok');
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 401) return;
    msg('admin-erro', `${nomeExibicao(usuario)}: ${mensagemErro(erro)}`, 'erro');
  }
  desenharAdmin();
}

function cliqueTabela(e) {
  const btn = e.target.closest('button[data-acao]');
  if (!btn || btn.disabled) return;
  const { acao, id } = btn.dataset;
  if (acao === 'bloquear') {
    admin.bloqueandoId = id;
    desenharAdmin();
  } else if (acao === 'cancelar-bloqueio') {
    admin.bloqueandoId = null;
    desenharAdmin();
  } else if (acao !== 'confirmar-bloqueio') {
    btn.disabled = true;
    executarAcao(acao, id);
  }
}

function envioTabela(e) {
  const form = e.target.closest('form[data-acao="confirmar-bloqueio"]');
  if (!form) return;
  e.preventDefault();
  const motivo = form.elements.motivo.value.trim();
  if (!motivo) {
    msg('admin-erro', 'Informe o motivo do bloqueio.', 'erro');
    form.elements.motivo.focus();
    return;
  }
  for (const b of form.querySelectorAll('button')) b.disabled = true;
  executarAcao('confirmar-bloqueio', form.dataset.id, motivo);
}

// ---------------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------------
$('btn-entrar').addEventListener('click', () => auth.entrar().catch(e => avisoMenu(mensagemErro(e), 'erro')));
$('btn-criar-conta').addEventListener('click', () => auth.entrar({ criarConta: true }).catch(e => avisoMenu(mensagemErro(e), 'erro')));
$('btn-sair').addEventListener('click', sair);
$('btn-sair-erro').addEventListener('click', sair);
$('btn-bloqueado-sair').addEventListener('click', sair);
$('btn-tentar').addEventListener('click', carregarConta);

$('btn-perfil').addEventListener('click', abrirPerfil);
$('btn-perfil-voltar').addEventListener('click', () => setState('menu'));
$('form-apelido').addEventListener('submit', salvarApelido);
$('perfil-apelido').addEventListener('input', () => msg('perfil-apelido-msg', ''));
$('btn-excluir').addEventListener('click', () => {
  $('btn-excluir').hidden = true;
  $('form-excluir').hidden = false;
  $('excluir-texto').focus();
});
$('btn-excluir-cancelar').addEventListener('click', fecharExclusao);
$('excluir-texto').addEventListener('input', e => {
  $('btn-excluir-confirmar').disabled = e.target.value.trim() !== 'EXCLUIR';
});
$('form-excluir').addEventListener('submit', excluirConta);

$('btn-comprar').addEventListener('click', () => abrirCreditos('menu'));
$('btn-ranges-comprar').addEventListener('click', () => abrirCreditos('ranges'));
$('btn-buy-comprar').addEventListener('click', () => abrirCreditos('buy'));
$('btn-result-comprar').addEventListener('click', () => abrirCreditos('menu'));
$('creditos-pacotes').addEventListener('click', e => {
  const btn = e.target.closest('button[data-pacote]');
  if (!btn || creditos.comprando) return;
  creditos.selecionado = btn.dataset.pacote;
  msg('creditos-msg', '');
  desenharCreditos();
});
$('btn-creditos-pagar').addEventListener('click', comprarPacote);
$('btn-creditos-voltar').addEventListener('click', () => voltarDaCompra(creditos.voltarPara));

$('btn-admin').addEventListener('click', abrirAdmin);
$('btn-admin-voltar').addEventListener('click', () => setState('menu'));
$('admin-filtros').addEventListener('submit', e => {
  e.preventDefault();
  admin.pagina = 0;
  carregarUsuarios();
});
for (const id of ['admin-status', 'admin-papel']) {
  $(id).addEventListener('change', () => { admin.pagina = 0; carregarUsuarios(); });
}
let buscaTimer = null;
$('admin-busca').addEventListener('input', () => {
  clearTimeout(buscaTimer);
  buscaTimer = setTimeout(() => { admin.pagina = 0; carregarUsuarios(); }, 350);
});
$('admin-anterior').addEventListener('click', () => { admin.pagina = Math.max(0, admin.pagina - 1); carregarUsuarios(); });
$('admin-proxima').addEventListener('click', () => { admin.pagina += 1; carregarUsuarios(); });
$('admin-linhas').addEventListener('click', cliqueTabela);
$('admin-linhas').addEventListener('submit', envioTabela);

