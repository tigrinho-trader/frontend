// @vitest-environment jsdom
// Painel do super-admin: carrega o painel.html de verdade com o gateway falso (fetch simulado).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const HTML = readFileSync(resolve(process.cwd(), "painel.html"), "utf-8");
const $ = (id) => document.getElementById(id);
const espera = () => new Promise((r) => setTimeout(r, 0));
async function estabilizar(n = 20) {
  for (let i = 0; i < n; i++) await espera();
}

let rotas;
let chamadas;
function json(status, corpo) {
  const texto = corpo === undefined ? "" : JSON.stringify(corpo);
  return { ok: status >= 200 && status < 300, status, text: async () => texto };
}

const AMBIENTE = { taxaPoupanca: 0, taxaDevolucao: 0.01, entradaLivre: true, niveis: [10, 20, 30], valorMinimo: 1,
  maxOperacoesDia: 100, maxAbertas: 100, perdaMaximaDiaBrl: 100 };
const RESUMO = {
  desde: "2026-11-10T03:00:00Z",
  perfis: [
    { usuarioId: "auth0|ana", operacoes: 10, acertos: 6, erros: 3, empates: 1, devolvidas: 0, apostado: 100, pago: 108.4,
      poupado: 3.2, taxasDevolucao: 0.4, lucro: 8, resultadoRealBrl: 7.5, sessoes: 2 },
    { usuarioId: "auth0|bia", operacoes: 4, acertos: 1, erros: 3, empates: 0, devolvidas: 0, apostado: 40, pago: 18.05,
      poupado: 0.95, taxasDevolucao: 0, lucro: -21.95, resultadoRealBrl: -22.1, sessoes: 1 },
  ],
  total: { usuarioId: null, operacoes: 14, acertos: 7, erros: 6, empates: 1, devolvidas: 0, apostado: 140, pago: 126.45,
    poupado: 4.15, taxasDevolucao: 0.4, lucro: -13.95, resultadoRealBrl: -14.6, sessoes: 3 },
};

const SITUACAO = {
  ativo: true, naFila: 1, valorNaFila: 39.21, minimoReais: 28.9, bloqueadoAte: "2026-11-16T21:30:00Z",
  motivo: "A ultima tentativa falhou: os repasses novos esperam ate a falha ser conferida (ou ate o horario)",
  repasses: [{ id: "r1", etapa: "FALHOU", ondeEstaODinheiro: null, valorReais: 40, criadoEm: "2026-11-15T20:00:00Z",
    atualizadoEm: "2026-11-16T15:30:00Z", erro: "passou do prazo de 3h parado em AGUARDANDO_DERIV", conferido: false }],
};

async function abrirPainel({ comToken = false } = {}) {
  document.documentElement.innerHTML = HTML.replace(/<script[\s\S]*?<\/script>/g, "");
  sessionStorage.clear();
  if (comToken) sessionStorage.setItem("painel-token", "tok-antigo");
  vi.resetModules();
  const modulo = await import("./painel.js");
  await estabilizar();
  return modulo;
}

async function entrar(senha = "a-senha") {
  $("login-senha").value = senha;
  $("form-login").dispatchEvent(new Event("submit", { cancelable: true }));
  await estabilizar();
}

beforeEach(() => {
  chamadas = [];
  rotas = {
    "POST /painel/login": [200, { token: "tok-1", expiraEm: "2026-11-16T20:00:00Z", usuario: "super-admin-oscar" }],
    "GET /painel/jogo/resultados": [200, RESUMO],
    "GET /painel/carteira/carteiras": [200, [{ usuarioId: "auth0|ana", saldo: 512.3 }, { usuarioId: "auth0|bia", saldo: 20 }]],
    "GET /painel/usuarios": [200, [{ id: "auth0|ana", apelido: "ana", email: "ana@exemplo.com" },
      { id: "auth0|bia", apelido: null, nome: "Bia", email: "bia@exemplo.com" }]],
    "GET /painel/carteira/poupanca": [200, { saldo: 4.15, movimentos: [
      { valor: 0.95, saldoApos: 4.15, descricao: "Poupança de uma flecha vencedora (1HZ100V)", criadaEm: "2026-11-16T01:00:00Z" }] }],
    "GET /painel/jogo/config": [200, { atual: { ...AMBIENTE, taxaPoupanca: 0.05 }, ambiente: AMBIENTE }],
    "GET /painel/carteira/repasse": [200, SITUACAO],
    "POST /painel/carteira/repasse/liberar": [200, { liberado: true, situacao: { ...SITUACAO, bloqueadoAte: null,
      motivo: "Na fila: o proximo ciclo (ate 15 s) inicia o repasse" } }],
    "PUT /painel/jogo/config": (init) => [200, { atual: { ...AMBIENTE, ...JSON.parse(init.body),
      niveis: JSON.parse(init.body).niveis || AMBIENTE.niveis }, ambiente: AMBIENTE }],
  };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const caminho = url.replace(/^\/api/, "").split("?")[0];
    const chave = `${init.method} ${caminho}`;
    chamadas.push({ chave, url, corpo: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
    const r = rotas[chave];
    if (!r) return json(404, { detail: `sem rota ${chave}` });
    const [status, corpo] = typeof r === "function" ? r(init) : r;
    return json(status, corpo);
  }));
});

describe("painel do super-admin", () => {
  it("entra com usuário e senha e mostra ganhos e perdas por perfil", async () => {
    await abrirPainel();
    expect($("tela-login").hidden).toBe(false);
    expect($("tela-painel").hidden).toBe(true);

    await entrar();
    const login = chamadas.find((c) => c.chave === "POST /painel/login");
    expect(login.corpo).toEqual({ usuario: "super-admin-oscar", senha: "a-senha" });
    expect($("tela-painel").hidden).toBe(false);
    expect($("login-senha").value).toBe("");                         // a senha não fica no campo
    expect(sessionStorage.getItem("painel-token")).toBe("tok-1");
    expect(chamadas.find((c) => c.chave === "GET /painel/jogo/resultados").url).toContain("dias=7");
    expect(chamadas.find((c) => c.chave === "GET /painel/jogo/resultados").auth).toBe("Bearer tok-1");

    expect($("resumo-lucro").textContent).toBe("−13,95");
    expect($("resumo-lucro").className).toBe("neg");
    expect($("resumo-poupado").textContent).toBe("4,15");
    expect($("resumo-acerto").textContent).toBe("53,8%");             // 7 de 13 decididas
    const linhas = [...$("perfis-linhas").querySelectorAll("tr")].map((tr) => tr.textContent.replace(/\s+/g, " "));
    expect(linhas[0]).toContain("ana");
    expect(linhas[0]).toContain("512,3");
    expect(linhas[0]).toContain("+8");
    expect(linhas[1]).toContain("Bia");
    expect(linhas[1]).toContain("−21,95");
  });

  it("senha errada mostra o erro e continua no login", async () => {
    rotas["POST /painel/login"] = [401, { detail: "Usuário ou senha incorretos" }];
    await abrirPainel();
    await entrar("errada");
    expect($("login-erro").textContent).toBe("Usuário ou senha incorretos");
    expect($("tela-painel").hidden).toBe(true);
    expect(sessionStorage.getItem("painel-token")).toBeNull();
  });

  it("token vencido volta para o login", async () => {
    rotas["GET /painel/jogo/resultados"] = [401, { detail: "Entre no painel do super-admin de novo" }];
    await abrirPainel({ comToken: true });
    expect($("tela-login").hidden).toBe(false);
    expect($("login-erro").textContent).toContain("Entre de novo");
    expect(sessionStorage.getItem("painel-token")).toBeNull();
  });

  it("período muda a consulta", async () => {
    await abrirPainel();
    await entrar();
    document.querySelector('.periodo[data-dias="0"]').click();
    await estabilizar();
    const ultimas = chamadas.filter((c) => c.chave === "GET /painel/jogo/resultados");
    expect(ultimas.at(-1).url).toContain("dias=0");
  });

  it("aba Poupança mostra o saldo guardado e os movimentos", async () => {
    await abrirPainel();
    await entrar();
    document.querySelector('.aba[data-aba="poupanca"]').click();
    await estabilizar();
    expect($("poupanca-saldo").textContent).toBe("4,15");
    expect($("poupanca-movimentos").textContent).toContain("Poupança de uma flecha vencedora");
    expect($("poupanca-movimentos").textContent).toContain("+0,95");
  });

  it("aba Regras: vazio vale o .env, taxa em % vira fração e salva", async () => {
    await abrirPainel();
    await entrar();
    document.querySelector('.aba[data-aba="regras"]').click();
    await estabilizar();
    expect($("cfg-taxaPoupanca").value).toBe("5");
    expect($("cfg-taxaDevolucao").value).toBe("");                    // igual ao .env
    expect($("cfg-taxaDevolucao").placeholder).toBe("1 (.env)");
    expect($("exemplo-poupanca").textContent).toContain("volta 18,05 (lucro de 8,05)");

    $("cfg-taxaPoupanca").value = "7.5";                              // o campo numérico entrega com ponto
    $("cfg-perdaMaximaDiaBrl").value = "40";
    $("cfg-entradaLivre").value = "false";
    $("form-regras").dispatchEvent(new Event("submit", { cancelable: true }));
    await estabilizar();
    const put = chamadas.find((c) => c.chave === "PUT /painel/jogo/config");
    expect(put.corpo).toEqual({ taxaPoupanca: 0.075, taxaDevolucao: null, perdaMaximaDiaBrl: 40, maxOperacoesDia: null,
      maxAbertas: null, valorMinimo: null, entradaLivre: false, niveis: null });
    expect($("regras-msg").textContent).toContain("Regras salvas");
  });

  it("níveis pela metade não são enviados", async () => {
    await abrirPainel();
    await entrar();
    document.querySelector('.aba[data-aba="regras"]').click();
    await estabilizar();
    $("cfg-nivel1").value = "5";
    $("form-regras").dispatchEvent(new Event("submit", { cancelable: true }));
    await estabilizar();
    expect(chamadas.some((c) => c.chave === "PUT /painel/jogo/config")).toBe(false);
    expect($("regras-msg").textContent).toContain("três níveis");
  });

  it("aba Repasse mostra por que está parado e libera com dois cliques depois de conferir", async () => {
    await abrirPainel();
    await entrar();
    document.querySelector('.aba[data-aba="repasse"]').click();
    await estabilizar();
    expect($("repasse-motivo").textContent).toContain("falhou");
    expect($("repasse-fila").textContent.replace(/\s/g, " ")).toContain("1 compra na fila · R$ 39,21");
    expect($("repasse-liberar").hidden).toBe(false);
    expect($("repasse-linhas").textContent).toContain("passou do prazo de 3h");

    $("btn-repasse-liberar").click();                                 // 1º clique só arma
    await estabilizar();
    expect(chamadas.some((c) => c.chave === "POST /painel/carteira/repasse/liberar")).toBe(false);
    expect($("btn-repasse-liberar").textContent).toBe("Clique de novo para liberar");
    $("btn-repasse-liberar").click();
    await estabilizar();
    expect(chamadas.some((c) => c.chave === "POST /painel/carteira/repasse/liberar")).toBe(true);
    expect($("repasse-msg").textContent).toContain("Liberado");
    expect($("repasse-liberar").hidden).toBe(true);
  });

  it("conversões de porcentagem e exemplo da poupança", async () => {
    const { paraFracao, paraPercentual, exemploPoupanca, comSinal } = await abrirPainel();
    expect(paraFracao("5")).toBe(0.05);
    expect(paraFracao("0,5")).toBe(0.005);
    expect(paraFracao("")).toBeNull();
    expect(Number.isNaN(paraFracao("x"))).toBe(true);
    expect(paraPercentual(0.075)).toBe("7.5");
    expect(exemploPoupanca(0.05)).toContain("volta 18,05");
    expect(exemploPoupanca(0)).toContain("volta 19 inteiros");
    expect(comSinal(-10)).toBe("−10");
  });
});
