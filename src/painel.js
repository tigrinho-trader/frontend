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
  abrirAba('resultados');
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
  for (const s of ['resultados', 'poupanca', 'regras']) $(`aba-${s}`).hidden = s !== nome;
  if (nome === 'resultados') carregarResultados();
  else if (nome === 'poupanca') carregarPoupanca();
  else carregarRegras();
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
for (const b of document.querySelectorAll('.periodo')) {
  b.addEventListener('click', () => {
    dias = Number(b.dataset.dias);
    for (const o of document.querySelectorAll('.periodo')) o.classList.toggle('ativo', o === b);
    carregarResultados();
  });
}
$('form-regras').addEventListener('submit', salvarRegras);
$('btn-padrao-regras').addEventListener('click', () => salvarRegras(null, {}));
$('cfg-taxaPoupanca').addEventListener('input', () => {
  const f = paraFracao($('cfg-taxaPoupanca').value);
  $('exemplo-poupanca').textContent = exemploPoupanca(f === null ? 0 : f);
});

if (token) mostrarPainel();
