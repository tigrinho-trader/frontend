// Painel do super-admin (/painel.html): login próprio do painel (usuário e senha conferidos no gateway), ganhos e
// perdas por perfil, carteira de poupança e as regras do jogo que valem por cima do .env.
import './painel.css';

const CHAVE_TOKEN = 'painel-token';
const $ = id => document.getElementById(id);

const fmtMoedas = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtReais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** "+8,05" / "−10" / "0" (moedas com sinal). */
export const comSinal = v => {
  const n = Number(v) || 0;
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtMoedas.format(Math.abs(n))}`;
};
export const reaisComSinal = v => {
  const n = Number(v) || 0;
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtReais.format(Math.abs(n))}`;
};
const classeSinal = v => (Number(v) > 0 ? 'pos' : Number(v) < 0 ? 'neg' : '');

/** Fração (0.05) → texto do campo em % ("5"). */
export const paraPercentual = f => (f === null || f === undefined ? '' : String(Math.round(Number(f) * 10000) / 100));
/** Texto em % ("5" ou "5,5") → fração (0.05); vazio → null (vale o .env). */
export function paraFracao(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 10000 : NaN;
}
const numeroOuNulo = texto => {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Exemplo da taxa de poupança: aposta de 10 que voltaria 19. */
export function exemploPoupanca(fracao) {
  const taxa = Number(fracao) || 0;
  const volta = Math.round(19 * (1 - taxa) * 100) / 100;
  const poupado = Math.round((19 - volta) * 100) / 100;
  return taxa > 0
    ? `Ex.: aposta de 10 que voltaria 19 volta ${fmtMoedas.format(volta)} (lucro de ${fmtMoedas.format(volta - 10)}) e ${fmtMoedas.format(poupado)} vai para a poupança. Perdas não mudam.`
    : 'Sem poupança: uma aposta de 10 que ganha volta 19 inteiros.';
}

// ---------------------------------------------------------------- API do painel
let token = null;
try { token = sessionStorage.getItem(CHAVE_TOKEN); } catch { token = null; }

class ErroPainel extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

async function pedir(metodo, caminho, corpo) {
  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (resposta.status === 401 && caminho !== '/painel/login') {
    sair('Sua sessão do painel acabou. Entre de novo.');
  }
  if (!resposta.ok) throw new ErroPainel(resposta.status, dados?.detail || `Erro ${resposta.status}`);
  return dados;
}

// ---------------------------------------------------------------- login
function mostrarPainel() {
  $('tela-login').hidden = true;
  $('tela-painel').hidden = false;
  $('painel-usuario').textContent = $('login-usuario').value || 'super-admin-oscar';
  abrirAba('financeiro');
}

function sair(mensagem = '') {
  token = null;
  try { sessionStorage.removeItem(CHAVE_TOKEN); } catch { /* sem armazenamento */ }
  $('tela-painel').hidden = true;
  $('tela-login').hidden = false;
  $('login-senha').value = '';
  $('login-erro').textContent = mensagem;
}

async function entrar(evento) {
  evento.preventDefault();
  $('login-erro').textContent = '';
  $('btn-entrar').disabled = true;
  try {
    const sessao = await pedir('POST', '/painel/login', {
      usuario: $('login-usuario').value.trim(), senha: $('login-senha').value,
    });
    token = sessao.token;
    try { sessionStorage.setItem(CHAVE_TOKEN, token); } catch { /* vale só nesta aba */ }
    $('login-senha').value = '';
    mostrarPainel();
  } catch (erro) {
    $('login-erro').textContent = erro.message;
  } finally {
    $('btn-entrar').disabled = false;
  }
}

// ---------------------------------------------------------------- abas
let dias = 7;

function abrirAba(nome) {
  for (const b of document.querySelectorAll('.aba')) b.classList.toggle('ativa', b.dataset.aba === nome);
  for (const s of ['financeiro', 'resultados', 'poupanca', 'repasse', 'regras']) $(`aba-${s}`).hidden = s !== nome;
  if (nome === 'financeiro') carregarFinanceiro();
  else if (nome === 'resultados') carregarResultados();
  else if (nome === 'poupanca') carregarPoupanca();
  else if (nome === 'repasse') carregarRepasse();
  else carregarRegras();
}

// ---------------------------------------------------------------- financeiro
let diasFinanceiro = 7;
const num = v => Number(v) || 0;
const fmtUsdt = v => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(num(v))} USDT`;
const fmtCripto = (v, moeda) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(num(v))} ${moeda}`;
const emReais = (usdt, cotacao) => (cotacao ? fmtReais.format(num(usdt) * num(cotacao)) : '—');

/** Um lugar do painel (Asaas, Binance...): o valor em reais, as linhas de detalhe e, se não respondeu, o erro. */
function mostrarLugar(id, parte, valor, linhas) {
  const ok = Boolean(parte?.dados);
  $(`lugar-${id}`).classList.toggle('indisponivel', !ok);
  $(`fin-${id}-valor`).textContent = ok ? valor : '—';
  $(`fin-${id}-erro`).hidden = ok;
  $(`fin-${id}-erro`).textContent = ok ? '' : `Não respondeu: ${parte?.erro || 'sem resposta'}`;
  const dl = $(`fin-${id}-linhas`);
  dl.innerHTML = '';
  if (!ok) return;
  for (const [rotulo, texto] of linhas) {
    const dt = document.createElement('dt');
    dt.textContent = rotulo;
    const dd = document.createElement('dd');
    dd.textContent = texto;
    dl.append(dt, dd);
  }
}

function linhasMovimentos(tbody, movimentos, comSituacao) {
  tbody.innerHTML = '';
  for (const m of movimentos) {
    const tr = document.createElement('tr');
    const quando = document.createElement('td');
    quando.textContent = (m.quando || '').replace('T', ' ').slice(0, 16);
    const oque = document.createElement('td');
    oque.textContent = m.descricao || '';
    if (!comSituacao && m.situacao) {
      const s = document.createElement('small');
      s.textContent = m.situacao;
      oque.appendChild(s);
    }
    const valor = document.createElement('td');
    valor.className = `num ${classeSinal(m.valor)}`.trim();
    valor.textContent = m.moeda === 'BRL' ? reaisComSinal(m.valor) : `${comSinal(m.valor)} ${m.moeda}`;
    tr.append(quando, oque, valor);
    if (comSituacao) {
      const s = document.createElement('td');
      s.textContent = m.situacao || '';
      tr.appendChild(s);
    }
    tbody.appendChild(tr);
  }
  if (!movimentos.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = comSituacao ? 4 : 3;
    td.textContent = 'Nada no período.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

export async function carregarFinanceiro() {
  $('fin-nota').textContent = 'Consultando o Asaas, a Binance, a carteira ponte e a Deriv…';
  try {
    const f = await pedir('GET', `/painel/carteira/financeiro?dias=${diasFinanceiro}`);
    const cot = f.cotacaoUsdt;
    $('fin-total').textContent = fmtReais.format(num(f.totalReais));
    $('fin-moedas').textContent = fmtReais.format(num(f.jogo.moedasPerfis));
    $('fin-perfis').textContent = `${f.jogo.perfis} perfi${f.jogo.perfis === 1 ? 'l' : 's'} · o que o jogo deve aos jogadores`;
    $('fin-sobra').textContent = reaisComSinal(f.sobra);
    $('fin-sobra').className = classeSinal(f.sobra);
    $('fin-poupanca').textContent = fmtReais.format(num(f.jogo.poupanca));
    const quando = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' }).format(new Date(f.em));
    $('fin-nota').textContent = `Atualizado às ${quando}`
      + (cot ? ` · USDT a ${fmtReais.format(num(cot))} (a conta Options, em dólar, entra pela mesma cotação)` : ' · sem cotação do USDT')
      + ` · fila do repasse: ${f.jogo.naFilaRepasse} (${fmtReais.format(num(f.jogo.valorFilaRepasse))})`;

    const a = f.asaas.dados;
    mostrarLugar('asaas', f.asaas, a && fmtReais.format(num(a.saldo)), a ? [
      ['Livre para saques Pix', fmtReais.format(num(a.caixaLivre))],
      ['Reservado para a corretora', fmtReais.format(num(a.saldo) - num(a.caixaLivre))],
    ] : []);
    const b = f.binance.dados;
    mostrarLugar('binance', f.binance, b && (cot ? fmtReais.format(num(b.brl) + num(b.usdt) * num(cot)) : fmtReais.format(num(b.brl))), b ? [
      ['Reais', fmtReais.format(num(b.brl))],
      ['USDT', `${fmtUsdt(b.usdt)} (${emReais(b.usdt, cot)})`],
      ['BNB', fmtCripto(b.bnb, 'BNB')],
    ] : []);
    const p = f.ponte.dados;
    mostrarLugar('ponte', f.ponte, p && emReais(p.usdt, cot), p ? [
      ['USDT parado', fmtUsdt(p.usdt)],
      ['BNB para o gás', `${fmtCripto(p.bnb, 'BNB')} · ${p.gasOk ? 'ok' : 'FALTA'}`],
      ['Endereço', `${p.endereco.slice(0, 6)}…${p.endereco.slice(-4)}`],
    ] : []);
    const d = f.deriv.dados;
    mostrarLugar('deriv', f.deriv, d && emReais(num(d.carteiraUsdt) + num(d.options), cot), d ? [
      ['Conta Options', `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(d.options))} ${d.moedaOptions}`],
      ['Carteira (ainda não foi para a Options)', fmtUsdt(d.carteiraUsdt)],
    ] : []);

    const fluxo = [];
    if (a) {
      fluxo.push(['Pix recebidos no Asaas', fmtReais.format(num(a.entradas)), 'compras de moedas e recargas']);
      fluxo.push(['Pix enviados pelo Asaas', fmtReais.format(num(a.saidas)), 'repasses e saques Pix']);
      fluxo.push(['Taxas do Asaas', fmtReais.format(num(a.taxas)), 'recebimento e transferências']);
    }
    if (b) {
      fluxo.push(['Depósitos na Binance', fmtReais.format(num(b.depositosBrl)), 'Pix em reais']);
      fluxo.push(['USDT comprado', fmtUsdt(b.usdtComprado), `por ${fmtReais.format(num(b.reaisEmUsdt))}`]);
      fluxo.push(['USDT sacado', fmtUsdt(b.usdtSacado), 'para a carteira ponte']);
    }
    $('fin-fluxo').innerHTML = '';
    for (const [rotulo, valor, sub] of fluxo) {
      const div = document.createElement('div');
      div.className = 'cartao-numero';
      const r = document.createElement('span');
      r.className = 'rotulo';
      r.textContent = rotulo;
      const v = document.createElement('b');
      v.textContent = valor;
      const s = document.createElement('small');
      s.textContent = sub;
      div.append(r, v, s);
      $('fin-fluxo').appendChild(div);
    }
    linhasMovimentos($('fin-asaas-movimentos'), a?.movimentos || [], false);
    linhasMovimentos($('fin-binance-movimentos'), b?.movimentos || [], true);
  } catch (erro) {
    if (erro.status !== 401) $('fin-nota').textContent = `Não deu para carregar: ${erro.message}`;
  }
}

// ---------------------------------------------------------------- resultados por perfil
const nomeDoPerfil = (id, usuarios) => {
  const u = usuarios.get(id);
  if (!u) return { nome: id, detalhe: '' };
  return { nome: u.apelido || u.nome || u.email || id, detalhe: u.email || id };
};

export async function carregarResultados() {
  $('resultados-msg').textContent = 'Carregando…';
  try {
    const [resumo, carteiras, usuarios] = await Promise.all([
      pedir('GET', `/painel/jogo/resultados?dias=${dias}`),
      pedir('GET', '/painel/carteira/carteiras').catch(() => []),
      pedir('GET', '/painel/usuarios').catch(() => []),
    ]);
    const porId = new Map(usuarios.map(u => [u.id, u]));
    const saldos = new Map(carteiras.map(c => [c.usuarioId, c.saldo]));
    const t = resumo.total;
    $('resumo-lucro').textContent = comSinal(t.lucro);
    $('resumo-lucro').className = classeSinal(t.lucro);
    $('resumo-real').textContent = reaisComSinal(t.resultadoRealBrl);
    $('resumo-real').className = classeSinal(t.resultadoRealBrl);
    $('resumo-poupado').textContent = fmtMoedas.format(Number(t.poupado) || 0);
    const decididas = t.acertos + t.erros;
    $('resumo-acerto').textContent = decididas ? `${fmtMoedas.format(Math.round(t.acertos / decididas * 1000) / 10)}%` : '—';
    $('resumo-placar').textContent = `${t.acertos} acertos · ${t.erros} erros · ${t.empates} empates · ${t.devolvidas} devolvidas`;
    $('perfis-linhas').innerHTML = '';
    for (const p of resumo.perfis) {
      const { nome, detalhe } = nomeDoPerfil(p.usuarioId, porId);
      const decid = p.acertos + p.erros;
      const tr = document.createElement('tr');
      const celulas = [
        [nome, detalhe],
        [saldos.has(p.usuarioId) ? fmtMoedas.format(Number(saldos.get(p.usuarioId))) : '—'],
        [String(p.operacoes)],
        [decid ? `${fmtMoedas.format(Math.round(p.acertos / decid * 1000) / 10)}%` : '—', `${p.acertos}/${decid}`],
        [fmtMoedas.format(Number(p.apostado) || 0)],
        [fmtMoedas.format(Number(p.pago) || 0)],
        [fmtMoedas.format(Number(p.taxasDevolucao) || 0)],
        [comSinal(p.lucro), null, classeSinal(p.lucro)],
        [reaisComSinal(p.resultadoRealBrl), null, classeSinal(p.resultadoRealBrl)],
        [fmtMoedas.format(Number(p.poupado) || 0)],
      ];
      celulas.forEach(([texto, sub, classe], i) => {
        const td = document.createElement('td');
        if (i > 0) td.className = `num ${classe || ''}`.trim();
        td.textContent = texto;
        if (sub) {
          const s = document.createElement('small');
          s.textContent = sub;
          td.appendChild(s);
        }
        tr.appendChild(td);
      });
      $('perfis-linhas').appendChild(tr);
    }
    $('resultados-msg').textContent = resumo.perfis.length ? '' : 'Nenhuma flecha de mercado nesse período.';
  } catch (erro) {
    if (erro.status !== 401) $('resultados-msg').textContent = `Não deu para carregar: ${erro.message}`;
  }
}

// ---------------------------------------------------------------- poupança
export async function carregarPoupanca() {
  try {
    const p = await pedir('GET', '/painel/carteira/poupanca');
    $('poupanca-saldo').textContent = fmtMoedas.format(Number(p.saldo) || 0);
    const lista = $('poupanca-movimentos');
    lista.innerHTML = '';
    for (const m of p.movimentos) {
      const li = document.createElement('li');
      const quando = document.createElement('span');
      quando.className = 'quando';
      quando.textContent = fmtData.format(new Date(m.criadaEm));
      const desc = document.createElement('span');
      desc.textContent = m.descricao || '';
      const valor = document.createElement('b');
      valor.className = classeSinal(m.valor);
      valor.textContent = comSinal(m.valor);
      li.append(quando, desc, valor);
      lista.appendChild(li);
    }
    if (!p.movimentos.length) {
      const li = document.createElement('li');
      li.className = 'vazio';
      li.textContent = 'Nada poupado ainda. Defina a taxa de poupança na aba Regras.';
      lista.appendChild(li);
    }
  } catch (erro) {
    if (erro.status !== 401) $('poupanca-saldo').textContent = '—';
  }
}

// ---------------------------------------------------------------- repasse
const ETAPAS = {
  NOVO: 'Começando', PAGANDO: 'Pagando o Pix', PIX_ENVIADO: 'Pix enviado à Binance', AGUARDANDO_BRL: 'Esperando os reais na Binance',
  COMPRANDO: 'Comprando USDT', COMPRADO: 'USDT comprado', SACANDO: 'Sacando para a carteira ponte',
  AGUARDANDO_CARTEIRA: 'Esperando a carteira ponte', ENVIANDO: 'Enviando para a Deriv', ENVIADO_DERIV: 'Enviado à Deriv',
  AGUARDANDO_DERIV: 'Esperando a Deriv creditar', TRANSFERINDO: 'Passando para a Options', CONCLUIDO: 'Concluído',
  FALHOU: 'Falhou',
};

function mostrarRepasse(sit) {
  $('repasse-motivo').textContent = sit.motivo || '—';
  const fila = `${sit.naFila} compra${sit.naFila === 1 ? '' : 's'} na fila · ${fmtReais.format(Number(sit.valorNaFila) || 0)}`;
  const minimo = sit.minimoReais === null || sit.minimoReais === undefined ? ''
    : ` · saque mínimo da Binance: ${fmtReais.format(Number(sit.minimoReais))}`;
  const tentaDeNovo = sit.bloqueadoAte
    ? ` · tenta de novo às ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' }).format(new Date(sit.bloqueadoAte))}`
    : '';
  $('repasse-fila').textContent = fila + minimo + tentaDeNovo;
  const linhas = $('repasse-linhas');
  linhas.innerHTML = '';
  for (const r of sit.repasses) {
    const tr = document.createElement('tr');
    const celulas = [
      fmtData.format(new Date(r.criadoEm)),
      fmtReais.format(Number(r.valorReais) || 0),
      ETAPAS[r.etapa] || r.etapa,
      r.erro || (r.ondeEstaODinheiro ? `no momento: ${r.ondeEstaODinheiro}` : ''),
    ];
    celulas.forEach((texto, i) => {
      const td = document.createElement('td');
      if (i === 1) td.className = 'num';
      if (i === 2) td.className = r.etapa === 'FALHOU' ? 'falhou' : r.etapa === 'CONCLUIDO' ? 'concluido' : '';
      td.textContent = texto;
      tr.appendChild(td);
    });
    linhas.appendChild(tr);
  }
  if (!sit.repasses.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'Nenhum repasse ainda.';
    tr.appendChild(td);
    linhas.appendChild(tr);
  }
}

export async function carregarRepasse() {
  try {
    mostrarRepasse(await pedir('GET', '/painel/carteira/repasse'));
  } catch (erro) {
    if (erro.status !== 401) $('repasse-motivo').textContent = `Não deu para carregar: ${erro.message}`;
  }
}

// ---------------------------------------------------------------- regras
const CAMPOS_PERCENTUAIS = ['taxaPoupanca', 'taxaDevolucao'];
const CAMPOS_NUMERICOS = ['perdaMaximaDiaBrl', 'maxOperacoesDia', 'maxAbertas', 'valorMinimo'];

/** Preenche o formulário: campo vazio quando vale o .env (o placeholder mostra o valor dele). */
export function preencherRegras({ atual, ambiente }) {
  for (const c of CAMPOS_PERCENTUAIS) {
    $(`cfg-${c}`).placeholder = `${paraPercentual(ambiente[c])} (.env)`;
    $(`cfg-${c}`).value = Number(atual[c]) === Number(ambiente[c]) ? '' : paraPercentual(atual[c]);
  }
  for (const c of CAMPOS_NUMERICOS) {
    $(`cfg-${c}`).placeholder = `${ambiente[c]} (.env)`;
    $(`cfg-${c}`).value = Number(atual[c]) === Number(ambiente[c]) ? '' : String(atual[c]);
  }
  $('cfg-entradaLivre').value = atual.entradaLivre === ambiente.entradaLivre ? '' : String(atual.entradaLivre);
  $('cfg-entradaLivre').options[0].textContent = `Padrão do .env (${ambiente.entradaLivre ? 'livre' : 'cobrar a tabela'})`;
  const iguais = atual.niveis.every((n, i) => n === ambiente.niveis[i]);
  atual.niveis.forEach((n, i) => {
    $(`cfg-nivel${i + 1}`).placeholder = `${ambiente.niveis[i]} (.env)`;
    $(`cfg-nivel${i + 1}`).value = iguais ? '' : String(n);
  });
  $('exemplo-poupanca').textContent = exemploPoupanca(atual.taxaPoupanca);
}

/** Corpo do PUT /painel/jogo/config a partir do formulário (vazio = null = vale o .env). */
export function corpoDasRegras() {
  const corpo = {};
  for (const c of CAMPOS_PERCENTUAIS) corpo[c] = paraFracao($(`cfg-${c}`).value);
  for (const c of CAMPOS_NUMERICOS) corpo[c] = numeroOuNulo($(`cfg-${c}`).value);
  const entrada = $('cfg-entradaLivre').value;
  corpo.entradaLivre = entrada === '' ? null : entrada === 'true';
  const niveis = [1, 2, 3].map(i => numeroOuNulo($(`cfg-nivel${i}`).value));
  corpo.niveis = niveis.every(n => n === null) ? null : niveis;
  return corpo;
}

export async function carregarRegras() {
  $('regras-msg').textContent = '';
  try {
    preencherRegras(await pedir('GET', '/painel/jogo/config'));
  } catch (erro) {
    if (erro.status !== 401) $('regras-msg').textContent = `Não deu para carregar: ${erro.message}`;
  }
}

async function salvarRegras(evento, corpo = corpoDasRegras()) {
  evento?.preventDefault();
  const msg = $('regras-msg');
  msg.className = 'msg';
  const invalido = Object.entries(corpo).find(([, v]) => Number.isNaN(v) || (Array.isArray(v) && v.some(Number.isNaN)));
  if (invalido) {
    msg.className = 'msg erro';
    msg.textContent = 'Confira os números: use só algarismos e vírgula.';
    return;
  }
  if (Array.isArray(corpo.niveis) && corpo.niveis.some(n => n === null)) {
    msg.className = 'msg erro';
    msg.textContent = 'Preencha os três níveis, ou deixe os três vazios para usar o .env.';
    return;
  }
  $('btn-salvar-regras').disabled = true;
  try {
    preencherRegras(await pedir('PUT', '/painel/jogo/config', corpo));
    msg.className = 'msg ok';
    msg.textContent = 'Regras salvas. Já valem para as próximas flechas.';
  } catch (erro) {
    msg.className = 'msg erro';
    if (erro.status !== 401) msg.textContent = erro.message;
  } finally {
    $('btn-salvar-regras').disabled = false;
  }
}

// ---------------------------------------------------------------- eventos
$('form-login').addEventListener('submit', entrar);
$('btn-sair').addEventListener('click', () => sair());
for (const b of document.querySelectorAll('.aba')) b.addEventListener('click', () => abrirAba(b.dataset.aba));
for (const b of document.querySelectorAll('.periodo[data-dias]')) {
  b.addEventListener('click', () => {
    dias = Number(b.dataset.dias);
    for (const o of document.querySelectorAll('.periodo[data-dias]')) o.classList.toggle('ativo', o === b);
    carregarResultados();
  });
}
$('form-regras').addEventListener('submit', salvarRegras);
$('btn-financeiro-atualizar').addEventListener('click', carregarFinanceiro);
for (const b of document.querySelectorAll('[data-dias-fin]')) {
  b.addEventListener('click', () => {
    diasFinanceiro = Number(b.dataset.diasFin);
    for (const o of document.querySelectorAll('[data-dias-fin]')) o.classList.toggle('ativo', o === b);
    carregarFinanceiro();
  });
}
$('btn-repasse-atualizar').addEventListener('click', carregarRepasse);
$('btn-padrao-regras').addEventListener('click', () => salvarRegras(null, {}));
$('cfg-taxaPoupanca').addEventListener('input', () => {
  const f = paraFracao($('cfg-taxaPoupanca').value);
  $('exemplo-poupanca').textContent = exemploPoupanca(f === null ? 0 : f);
});

if (token) mostrarPainel();
