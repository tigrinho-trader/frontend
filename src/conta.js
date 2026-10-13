// Conta do jogador: login (OpenID Connect), menu, "Meu perfil", "Comprar moedas", "Administração" e conta bloqueada.
// Liga a API ao login e decide o que o menu mostra. O jogo em si fica em jogo.js.
import * as auth from './auth.js';
import * as api from './api.js';
import { ErroApi, configurarApi } from './api.js';
import { setState, atualizarCarteira, estadoAtual, saldoAtual, voltarDaCompra } from './jogo.js';
import {
  LIMITES_PADRAO, PACOTES, TEXTO_STATUS_FINAL, htmlPacotes, mensagemErroCompra, moedasDoValor, pacotesDoServidor,
  precoEmReais, qrCodeSeguro, tempoRestante, textoFaixa, valorDasMoedas,
} from './creditos.js';
import { ARROW_TYPES, RANGE_BY_SLUG } from './regras.js';
import { ATIVO_POR_SIMBOLO, reaisComSinal, textoTaxa } from './bitcoin.js';
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

/** Texto de um erro do login: o aviso pronto de ErroLogin (ex.: servidor fora do ar) ou `prefixo` + mensagem. */
function mensagemLogin(erro, prefixo = '') {
  if (erro?.name === 'ErroLogin') return erro.message;
  return `${prefixo}${mensagemErro(erro)}`;
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

/** Evita laço de redirecionamento: só volta ao servidor de login se não voltou há menos de 30 s. */
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
    auth.entrar().catch(e => {
      perfil = null;
      avisoMenu(mensagemLogin(e), 'erro');
      modoMenu('anonimo');
      setState('menu');
    });
    return;
  }
  perfil = null;
  $('menu-erro').textContent = 'O servidor recusou seu login (401). Confira se o emissor e a audiência do login '
    + '(VITE_OIDC_AUTHORITY / VITE_OIDC_AUDIENCE) batem com AUTH_ISSUER / AUTH_AUDIENCE do api-gateway e entre de novo.';
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
    avisoMenu(mensagemLogin(e, 'Não foi possível iniciar o login: '), 'erro');
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

/** Cada aposta de mercado vale R$ 10 (100 moedas a 10 moedas por real). */
const APOSTA_BRL = 10;

/**
 * Linhas da tabela de acerto por criptomoeda (GET /jogos/flecha/estudo/meus-acertos) e o total. "Aposta" é o
 * placar (acertos − erros) × R$ 10; "Operações" é quanto as ordens na margem renderam, já com as taxas.
 */
export function htmlAcertos(dados) {
  const cor = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const linha = (rotulo, n, classe = '') => {
    const acertos = Number(n?.acertos) || 0, erros = Number(n?.erros) || 0;
    const aposta = (acertos - erros) * APOSTA_BRL;       // placar das apostas, sem taxas
    const operacoes = Number(n?.resultadoLiquidoBrl) || 0;   // ordens na margem, com taxas
    return `<tr${classe ? ` class="${classe}"` : ''}>
      <td>${rotulo}</td><td>${Number(n?.operacoes) || 0}</td><td>${acertos}</td>
      <td>${erros}</td><td>${Number(n?.empates) || 0}</td><td>${textoTaxa(n?.taxaAcertoPercentual)}</td>
      <td class="${cor(aposta)}">${reaisComSinal(aposta)}</td>
      <td class="${cor(operacoes)}">${reaisComSinal(operacoes)}</td>
    </tr>`;
  };
  const porAtivo = Array.isArray(dados?.porAtivo) ? dados.porAtivo : [];
  if (!porAtivo.some(n => Number(n.operacoes) > 0)) {
    return '<tr><td colspan="8" class="vazio">Você ainda não fez apostas com as flechas de mercado.</td></tr>';
  }
  return porAtivo.map(n => {
    const ativo = ATIVO_POR_SIMBOLO[n.simbolo];
    return linha(ativo ? `${escaparHtml(ativo.marca)} ${escaparHtml(ativo.nome)}` : escaparHtml(n.simbolo || '?'), n);
  }).join('') + linha('Total', dados.total, 'total');
}

// ---------------------------------------------------------------------------
// Saldo: moedas, flechas guardadas e últimas movimentações
// ---------------------------------------------------------------------------
const MOEDAS_POR_REAL = 10;
const reaisDeMoedas = m => (m / MOEDAS_POR_REAL).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Flechas guardadas: as de mercado servem em qualquer campo; as comuns, só no campo onde foram compradas. */
export function htmlAljavaGuardada(aljava) {
  const itens = (flechas, tipos) => tipos
    .map(t => [t, Number(flechas?.[t.id]) || 0])
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${escaparHtml(t.name.toLowerCase())}`);
  const linhas = [];
  const mercado = itens(aljava?.mercado, ARROW_TYPES.filter(t => t.mercado));
  if (mercado.length) linhas.push(`<li><b>Mercado</b> (qualquer campo): ${mercado.join(', ')}</li>`);
  for (const [slug, flechas] of Object.entries(aljava?.campos || {})) {
    const comuns = itens(flechas, ARROW_TYPES.filter(t => !t.mercado));
    if (comuns.length) {
      linhas.push(`<li><b>${escaparHtml(RANGE_BY_SLUG[slug]?.name || slug)}</b>: ${comuns.join(', ')}</li>`);
    }
  }
  return linhas.length
    ? `<ul class="lista-aljava">${linhas.join('')}</ul>`
    : '<p class="vazio">Nenhuma flecha guardada. As que sobrarem numa rodada aparecem aqui.</p>';
}

function mostrarSaldoNaTela() {
  const saldo = saldoAtual();
  $('saldo-moedas').textContent = formatarMoedas(saldo);
  $('saldo-referencia').textContent = `Valor de referência: ${reaisDeMoedas(saldo)} (10 moedas = R$ 1)`;
}

async function abrirSaldo() {
  mostrarSaldoNaTela();
  $('saldo-aljava').innerHTML = '<p class="vazio">Carregando…</p>';
  $('saldo-extrato').innerHTML = '<tr><td colspan="4" class="vazio">Carregando…</td></tr>';
  setState('saldo');
  const [aljava, transacoes] = await Promise.allSettled([api.aljavaGuardada(), api.extrato(),
    atualizarCarteira()]);
  if (estadoAtual() !== 'saldo') return;
  mostrarSaldoNaTela();
  $('saldo-aljava').innerHTML = aljava.status === 'fulfilled'
    ? htmlAljavaGuardada(aljava.value)
    : `<p class="vazio erro">${escaparHtml(mensagemErro(aljava.reason))}</p>`;
  $('saldo-extrato').innerHTML = transacoes.status === 'fulfilled'
    ? htmlExtrato(transacoes.value, 10)
    : `<tr><td colspan="4" class="vazio erro">${escaparHtml(mensagemErro(transacoes.reason))}</td></tr>`;
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

  // Atualiza os dados, o extrato e os acertos em paralelo
  $('perfil-acertos').innerHTML = '<tr><td colspan="8" class="vazio">Carregando…</td></tr>';
  const [eu, transacoes, acertos] = await Promise.allSettled([api.meuPerfil(), api.extrato(), api.meusAcertos()]);
  if (estadoAtual() !== 'perfil') return;
  if (eu.status === 'fulfilled') {
    perfil = eu.value;
    preencherPerfil();
    mostrarPerfilNoMenu();
  }
  $('perfil-extrato').innerHTML = transacoes.status === 'fulfilled'
    ? htmlExtrato(transacoes.value, 10)
    : `<tr><td colspan="4" class="vazio erro">${escaparHtml(mensagemErro(transacoes.reason))}</td></tr>`;
  $('perfil-acertos').innerHTML = acertos.status === 'fulfilled'
    ? htmlAcertos(acertos.value)
    : `<tr><td colspan="8" class="vazio erro">${escaparHtml(mensagemErro(acertos.reason))}</td></tr>`;
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
// Comprar moedas (Pix pelo AbacatePay; sem Pix configurado, pagamento de teste)
// ---------------------------------------------------------------------------
export const INTERVALO_CONSULTA_PIX = 3000;

const creditos = {
  selecionado: null, voltarPara: 'menu', comprando: false,
  modo: 'sandbox',            // 'pix' | 'sandbox' | 'indisponivel'
  centavosPorMoeda: 10, pacotes: PACOTES, ...LIMITES_PADRAO.sandbox,
  livre: null,                // valor digitado: { moedas } ou { moedas: null, erro }
  compra: null,               // compra Pix pendente sendo acompanhada
  consulta: null, relogio: null,
};

const pacoteSelecionado = () => creditos.pacotes.find(p => p.id === creditos.selecionado);
const limitesCreditos = () => ({
  centavosPorMoeda: creditos.centavosPorMoeda,
  minimoMoedas: creditos.minimoMoedas,
  maximoMoedas: creditos.maximoMoedas,
});
/** Quantas moedas o jogador escolheu: o valor digitado ou o pacote marcado. */
const moedasEscolhidas = () => (creditos.livre ? creditos.livre.moedas : pacoteSelecionado()?.moedas) || null;

function limparEscolha() {
  creditos.selecionado = null;
  creditos.livre = null;
  $('creditos-valor').value = '';
}

function pararAcompanhamento() {
  clearTimeout(creditos.consulta);
  clearInterval(creditos.relogio);
  creditos.consulta = null;
  creditos.relogio = null;
}

/** Para as consultas periódicas do Pix (usado pelos testes ao trocar de app entre um caso e outro). */
export const pararAcompanhamentos = pararAcompanhamento;

function desenharCreditos() {
  $('creditos-saldo').textContent = formatarMoedas(saldoAtual());
  const pix = creditos.compra;
  const indisponivel = creditos.modo === 'indisponivel';
  $('creditos-indisponivel').hidden = !indisponivel;
  $('creditos-pacotes').hidden = !!pix || indisponivel;
  $('creditos-pacotes').innerHTML = htmlPacotes(creditos.pacotes, creditos.selecionado,
    creditos.modo === 'pix' ? creditos.centavosPorMoeda : null);

  $('creditos-valor-livre').hidden = !!pix || indisponivel;
  $('creditos-valor').disabled = creditos.comprando;
  const erroValor = creditos.livre?.erro;
  $('creditos-valor-dica').textContent = erroValor || `Valores ${textoFaixa(limitesCreditos())}.`;
  $('creditos-valor-dica').classList.toggle('erro', !!erroValor);
  $('creditos-valor-moedas').textContent = `R$ 1 = ${formatarMoedas(100 / creditos.centavosPorMoeda)} moedas`;

  const moedas = moedasEscolhidas();
  $('creditos-confirmar').hidden = !moedas || !!pix || indisponivel;
  if (moedas) {
    $('creditos-qtd').textContent = formatarMoedas(moedas);
    $('creditos-preco').textContent = creditos.modo === 'pix'
      ? ` por ${precoEmReais(moedas, creditos.centavosPorMoeda)}` : ' na sua carteira';
  }
  $('creditos-aviso-sandbox').hidden = creditos.modo !== 'sandbox';
  $('btn-creditos-pagar').textContent = creditos.modo === 'pix' ? 'Gerar Pix' : 'Confirmar compra';
  $('btn-creditos-pagar').disabled = creditos.comprando;

  $('creditos-pix').hidden = !pix;
  if (pix) {
    const qr = qrCodeSeguro(pix.brCodeBase64);
    $('pix-qr').hidden = !qr;
    if (qr) $('pix-qr').src = qr;
    $('pix-copia').value = pix.brCode || '';
    $('btn-pix-simular').hidden = !pix.devMode;
    $('pix-aviso-dev').hidden = !pix.devMode;
    $('btn-pix-verificar').disabled = creditos.comprando;
    $('btn-pix-simular').disabled = creditos.comprando;
    $('pix-tempo').textContent = tempoRestante(pix.expiraEm) || 'expirando…';
  }
}

/** Carrega a configuração da loja: Pix ligado, só o pagamento de teste, ou nada. */
async function carregarConfigCompras() {
  try {
    const cfg = await api.configCompras();
    creditos.centavosPorMoeda = Number(cfg?.centavosPorMoeda) || 10;
    if (cfg?.pixHabilitado) {
      creditos.modo = 'pix';
      creditos.pacotes = pacotesDoServidor(cfg.pacotes);
    } else {
      creditos.modo = cfg?.sandboxHabilitado === false ? 'indisponivel' : 'sandbox';
      creditos.pacotes = PACOTES;
    }
    const padrao = LIMITES_PADRAO[creditos.modo === 'pix' ? 'pix' : 'sandbox'];
    creditos.minimoMoedas = Number(cfg?.minimoMoedas) || padrao.minimoMoedas;
    creditos.maximoMoedas = Number(cfg?.maximoMoedas) || padrao.maximoMoedas;
  } catch (erro) {
    // carteira antiga (sem /compras): segue no pagamento de teste
    creditos.modo = 'sandbox';
    creditos.pacotes = PACOTES;
    Object.assign(creditos, LIMITES_PADRAO.sandbox);
    if (erro.status !== 404 && erro.status !== 401 && erro.status !== 403) {
      msg('creditos-msg', mensagemErroCompra(erro), 'erro');
    }
  }
}

/** Abre a loja de moedas lembrando a tela de onde o jogador veio. */
async function abrirCreditos(voltarPara = 'menu') {
  pararAcompanhamento();
  creditos.voltarPara = voltarPara;
  limparEscolha();
  creditos.compra = null;
  msg('creditos-msg', '');
  desenharCreditos();
  setState('creditos');
  await carregarConfigCompras();
  if (estadoAtual() === 'creditos') desenharCreditos();
}

function sairDosCreditos() {
  pararAcompanhamento();
  creditos.compra = null;
  if (creditos.voltarPara === 'saldo') abrirSaldo();   // volta com o saldo novo
  else voltarDaCompra(creditos.voltarPara);
}

/** Aplica a resposta do servidor sobre a compra Pix acompanhada. */
async function atualizarCompraPix(compra) {
  if (compra?.status === 'PENDENTE') {
    creditos.compra = compra;
    return;
  }
  pararAcompanhamento();
  creditos.compra = null;
  limparEscolha();
  if (compra?.status === 'PAGA') {
    await atualizarCarteira().catch(() => {});
    msg('creditos-msg', `Pagamento confirmado! ${formatarMoedas(compra.moedas)} moedas entraram na sua carteira.`, 'ok');
  } else {
    msg('creditos-msg', TEXTO_STATUS_FINAL[compra?.status] || TEXTO_STATUS_FINAL.FALHOU, 'erro');
  }
}

/** Pergunta ao servidor (que pergunta ao AbacatePay) se o Pix já foi pago. */
async function verificarPix({ simular = false } = {}) {
  const compra = creditos.compra;
  if (!compra || creditos.comprando) return;
  clearTimeout(creditos.consulta);
  creditos.comprando = true;
  desenharCreditos();
  try {
    const r = simular ? await api.simularPagamentoPix(compra.id) : await api.consultarCompraPix(compra.id);
    await atualizarCompraPix(r);
    if (creditos.compra && !simular) {
      msg('creditos-msg', 'Ainda não recebemos o pagamento. Assim que o Pix cair, as moedas entram sozinhas.');
    }
  } catch (erro) {
    if (erro.status !== 401 && erro.status !== 403) msg('creditos-msg', mensagemErroCompra(erro), 'erro');
  } finally {
    creditos.comprando = false;
    if (estadoAtual() === 'creditos') {
      desenharCreditos();
      agendarConsulta();
    }
  }
}

/** Enquanto a tela estiver aberta e o Pix pendente, confere sozinho de tempos em tempos. */
function agendarConsulta() {
  clearTimeout(creditos.consulta);
  if (!creditos.compra || estadoAtual() !== 'creditos') return;
  creditos.consulta = setTimeout(async () => {
    if (!creditos.compra || estadoAtual() !== 'creditos' || creditos.comprando) return;
    try {
      await atualizarCompraPix(await api.consultarCompraPix(creditos.compra.id));
    } catch { /* tenta de novo na próxima volta */ }
    if (estadoAtual() === 'creditos') {
      desenharCreditos();
      agendarConsulta();
    }
  }, INTERVALO_CONSULTA_PIX);
}

function atualizarRelogioPix() {
  if (estadoAtual() === 'creditos' && creditos.compra) {
    $('pix-tempo').textContent = tempoRestante(creditos.compra.expiraEm) || 'expirando…';
  }
}

async function comprarPacote() {
  const moedas = moedasEscolhidas();
  if (!moedas || creditos.comprando || creditos.compra) return;
  creditos.comprando = true;
  desenharCreditos();
  msg('creditos-msg', creditos.modo === 'pix' ? 'Gerando o Pix…' : 'Processando…');
  try {
    if (creditos.modo === 'pix') {
      creditos.compra = await api.iniciarCompraPix(moedas);
      msg('creditos-msg', 'Pague com o app do seu banco: leia o QR Code ou use o copia e cola.');
      clearInterval(creditos.relogio);
      creditos.relogio = setInterval(atualizarRelogioPix, 1000);
    } else {
      await api.comprarMoedas(moedas);
      await atualizarCarteira().catch(() => {});
      limparEscolha();
      msg('creditos-msg', `Pronto! ${formatarMoedas(moedas)} moedas entraram na sua carteira.`, 'ok');
    }
  } catch (erro) {
    if (erro.status !== 401 && erro.status !== 403) msg('creditos-msg', mensagemErroCompra(erro), 'erro');
  } finally {
    creditos.comprando = false;
    if (estadoAtual() === 'creditos') {
      desenharCreditos();
      agendarConsulta();
    }
  }
}

async function copiarPix() {
  const campo = $('pix-copia');
  try {
    await navigator.clipboard.writeText(campo.value);
    msg('creditos-msg', 'Código Pix copiado!', 'ok');
  } catch {
    campo.select();
    msg('creditos-msg', 'Selecionei o código: copie com Ctrl+C.');
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
$('btn-entrar').addEventListener('click', () => auth.entrar().catch(e => avisoMenu(mensagemLogin(e), 'erro')));
$('btn-criar-conta').addEventListener('click', () => auth.entrar({ criarConta: true }).catch(e => avisoMenu(mensagemLogin(e), 'erro')));
$('btn-sair').addEventListener('click', sair);
$('btn-sair-erro').addEventListener('click', sair);
$('btn-bloqueado-sair').addEventListener('click', sair);
$('btn-tentar').addEventListener('click', carregarConta);

$('btn-perfil').addEventListener('click', abrirPerfil);
$('btn-perfil-voltar').addEventListener('click', () => setState('menu'));
$('form-apelido').addEventListener('submit', salvarApelido);
$('btn-saldo').addEventListener('click', abrirSaldo);
$('btn-saldo-voltar').addEventListener('click', () => setState('menu'));
$('btn-saldo-comprar').addEventListener('click', () => abrirCreditos('saldo'));
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
  if (!btn || creditos.comprando || creditos.compra) return;
  creditos.selecionado = btn.dataset.pacote;
  creditos.livre = null;
  // o campo mostra o valor do pacote, para o jogador ajustar a partir dele
  $('creditos-valor').value = valorDasMoedas(pacoteSelecionado()?.moedas, creditos.centavosPorMoeda);
  msg('creditos-msg', '');
  desenharCreditos();
});
$('creditos-valor').addEventListener('input', e => {
  if (creditos.comprando || creditos.compra) return;
  const livre = moedasDoValor(e.target.value, limitesCreditos());
  creditos.livre = livre.moedas || livre.erro ? livre : null;
  // valor igual ao de um pacote deixa o pacote marcado
  creditos.selecionado = creditos.pacotes.find(p => p.moedas === livre.moedas)?.id || null;
  msg('creditos-msg', '');
  desenharCreditos();
});
$('creditos-valor').addEventListener('keydown', e => {
  if (e.key === 'Enter') comprarPacote();
});
$('btn-creditos-pagar').addEventListener('click', comprarPacote);
$('btn-creditos-voltar').addEventListener('click', sairDosCreditos);
$('btn-pix-copiar').addEventListener('click', copiarPix);
$('btn-pix-verificar').addEventListener('click', () => verificarPix());
$('btn-pix-simular').addEventListener('click', () => verificarPix({ simular: true }));

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

