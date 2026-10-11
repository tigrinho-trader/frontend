// @vitest-environment jsdom
// Teste de fumaça das telas: carrega o index.html de verdade, o jogo e a conta,
// com o Auth0 e o api-gateway falsos (fetch simulado).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HTML = readFileSync(resolve(process.cwd(), "index.html"), "utf-8");

// Auth0 falso, controlado por cada teste
const authFalso = {
  configurado: true,
  autenticado: true,
  erro: null,
};
vi.mock("./auth.js", () => ({
  configurado: () => authFalso.configurado,
  faltando: () => [],
  iniciar: async () => ({ autenticado: authFalso.autenticado, erro: authFalso.erro }),
  entrar: vi.fn(async () => {}),
  sair: vi.fn(async () => {}),
  token: async () => "tok",
  usuarioAuth0: async () => null,
}));

const EU = {
  id: "auth0|eu", email: "eu@x.com", nome: "Eu Mesmo", apelido: "eu_mesmo", avatarUrl: null,
  papel: "ADMIN", status: "ATIVO", criadoEm: "2026-10-01T12:00:00Z", ultimoAcessoEm: "2026-10-11T12:00:00Z",
};

function sessao(extra = {}) {
  return {
    id: "s-1", campo: "vilarejo", status: "ABERTA", custo: 15, ganhos: 0, resultado: -15, acertos: 0,
    flechas: { wood: 10, iron: 0, gold: 0, diamond: 0 },
    compradas: { wood: 10, iron: 0, gold: 0, diamond: 0 },
    disparadas: { wood: 0, iron: 0, gold: 0, diamond: 0 },
    ...extra,
  };
}

/** Servidor falso: rotas "MÉTODO /caminho" → [status, corpo] ou função. */
let rotas;
const chamadas = [];
function json(status, corpo) {
  const texto = corpo === undefined ? "" : JSON.stringify(corpo);
  return { ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, text: async () => texto };
}
async function fetchFalso(url, init) {
  const caminho = url.replace(/^\/api/, "").split("?")[0];
  const chave = `${init.method} ${caminho}`;
  chamadas.push({ chave, url, corpo: init.body ? JSON.parse(init.body) : undefined });
  const r = rotas[chave];
  if (!r) return json(404, { detail: `sem rota ${chave}` });
  const [status, corpo] = typeof r === "function" ? r(init) : r;
  return json(status, corpo);
}

const $ = (id) => document.getElementById(id);
const espera = () => new Promise((r) => setTimeout(r, 0));
async function estabilizar(n = 8) {
  for (let i = 0; i < n; i++) await espera();
}

async function iniciarApp() {
  document.documentElement.innerHTML = HTML.replace(/<script[\s\S]*?<\/script>/g, "");
  vi.resetModules();
  const conta = await import("./conta.js");
  await conta.iniciarConta();
  await estabilizar();
}

beforeEach(() => {
  authFalso.configurado = true;
  authFalso.autenticado = true;
  authFalso.erro = null;
  chamadas.length = 0;
  rotas = {
    "GET /usuarios/me": [200, EU],
    "GET /carteira": [200, { usuarioId: EU.id, saldo: 1000, atualizadaEm: null }],
    "GET /jogos/flecha/sessoes/atual": [204],
    "GET /carteira/extrato": [200, [{ tipo: "BONUS_INICIAL", valor: 1000, descricao: "Bonus de boas-vindas", criadaEm: "2026-10-01T12:00:00Z" }]],
  };
  vi.stubGlobal("fetch", fetchFalso);
  vi.stubGlobal("requestAnimationFrame", () => 0);
  // canvas falso: qualquer chamada devolve o próprio objeto
  const ctx = new Proxy({}, { get: (alvo, p) => (p in alvo ? alvo[p] : () => ctx), set: (alvo, p, v) => ((alvo[p] = v), true) });
  HTMLCanvasElement.prototype.getContext = () => ctx;
  HTMLCanvasElement.prototype.toDataURL = () => "data:,";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("menu e login", () => {
  it("sem as variáveis do Auth0 mostra o aviso e trava os botões", async () => {
    authFalso.configurado = false;
    await iniciarApp();
    expect($("menu").dataset.conta).toBe("anonimo");
    expect($("aviso-config").hidden).toBe(false);
    expect($("aviso-config").textContent).toContain("VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID e VITE_AUTH0_AUDIENCE");
    expect($("btn-entrar").disabled).toBe(true);
    expect(chamadas).toHaveLength(0);
  });

  it("sem login mostra Entrar e Criar conta", async () => {
    authFalso.autenticado = false;
    authFalso.erro = "Cancelado";
    await iniciarApp();
    expect($("menu").dataset.conta).toBe("anonimo");
    expect($("aviso-config").hidden).toBe(true);
    expect($("menu-aviso").textContent).toContain("Cancelado");
    const auth = await import("./auth.js");
    $("btn-criar-conta").click();
    expect(auth.entrar).toHaveBeenCalledWith({ criarConta: true });
  });

  it("logado: apelido, saldo da carteira e Administração para ADMIN", async () => {
    await iniciarApp();
    expect($("menu").dataset.conta).toBe("logado");
    expect($("menu-apelido").textContent).toBe("eu_mesmo");
    expect($("menu-avatar").textContent).toBe("EM");
    expect($("menu-wallet").textContent).toBe("1.000");
    expect($("btn-admin").hidden).toBe(false);
  });

  it("jogador comum não vê Administração", async () => {
    rotas["GET /usuarios/me"] = [200, { ...EU, papel: "JOGADOR" }];
    await iniciarApp();
    expect($("btn-admin").hidden).toBe(true);
  });

  it("encerra a rodada que ficou aberta e avisa", async () => {
    rotas["GET /jogos/flecha/sessoes/atual"] = [200, sessao()];
    rotas["POST /jogos/flecha/sessoes/s-1/encerrar"] = [200, sessao({ status: "ENCERRADA", ganhos: 25, resultado: 10 })];
    await iniciarApp();
    expect(chamadas.map((c) => c.chave)).toContain("POST /jogos/flecha/sessoes/s-1/encerrar");
    expect($("menu-aviso").textContent).toContain("Campo do Vilarejo");
    expect($("menu-aviso").textContent).toContain("+10");
  });

  it("conta bloqueada (403) mostra a tela de bloqueio", async () => {
    rotas["GET /usuarios/me"] = [403, { detail: "Conta bloqueada", status: 403 }];
    await iniciarApp();
    expect($("bloqueado").classList.contains("show")).toBe(true);
    expect($("bloqueado-titulo").textContent).toBe("Conta bloqueada");
  });

  it("servidor fora do ar: mensagem e Tentar de novo", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    await iniciarApp();
    expect($("menu").dataset.conta).toBe("erro");
    expect($("menu-erro").textContent).toContain("Sem conexão com o servidor");
    vi.stubGlobal("fetch", fetchFalso);
    $("btn-tentar").click();
    await estabilizar();
    expect($("menu").dataset.conta).toBe("logado");
  });
});

describe("perfil", () => {
  it("mostra dados e extrato; apelido em uso (409) aparece na tela", async () => {
    rotas["PATCH /usuarios/me"] = [409, { detail: "Apelido já está em uso", status: 409 }];
    await iniciarApp();
    $("btn-perfil").click();
    await estabilizar();
    expect($("perfil").classList.contains("show")).toBe(true);
    expect($("perfil-email").textContent).toBe("eu@x.com");
    expect($("perfil-papel").textContent).toBe("Administrador");
    expect($("perfil-extrato").textContent).toContain("Bônus inicial");

    $("perfil-apelido").value = "ab";
    $("form-apelido").dispatchEvent(new Event("submit", { cancelable: true }));
    expect($("perfil-apelido-msg").textContent).toMatch(/pelo menos 3/);

    $("perfil-apelido").value = "novo_nome";
    $("form-apelido").dispatchEvent(new Event("submit", { cancelable: true }));
    await estabilizar();
    expect($("perfil-apelido-msg").textContent).toBe("Esse apelido já está em uso. Escolha outro.");
  });

  it("excluir conta só com EXCLUIR digitado", async () => {
    rotas["DELETE /usuarios/me"] = [204];
    await iniciarApp();
    $("btn-perfil").click();
    await estabilizar();
    $("btn-excluir").click();
    expect($("form-excluir").hidden).toBe(false);
    const campo = $("excluir-texto");
    campo.value = "excluir";
    campo.dispatchEvent(new Event("input"));
    expect($("btn-excluir-confirmar").disabled).toBe(true);
    campo.value = "EXCLUIR";
    campo.dispatchEvent(new Event("input"));
    expect($("btn-excluir-confirmar").disabled).toBe(false);
    $("form-excluir").dispatchEvent(new Event("submit", { cancelable: true }));
    await estabilizar();
    expect(chamadas.map((c) => c.chave)).toContain("DELETE /usuarios/me");
    const auth = await import("./auth.js");
    expect(auth.sair).toHaveBeenCalled();
  });
});

describe("administração", () => {
  const outro = { id: "auth0|1", apelido: "ana", nome: "Ana", email: "ana@x.com", papel: "JOGADOR", status: "ATIVO" };

  it("lista usuários e bloqueia com motivo (id codificado)", async () => {
    rotas["GET /usuarios"] = [200, { itens: [EU, outro], total: 2, pagina: 0, tamanho: 20 }];
    rotas["PATCH /usuarios/auth0%7C1/status"] = [200, { ...outro, status: "BLOQUEADO", motivoBloqueio: "spam" }];
    await iniciarApp();
    $("btn-admin").click();
    await estabilizar();
    expect($("admin-linhas").querySelectorAll("tr")).toHaveLength(2);
    expect($("admin-pagina").textContent).toBe("Página 1 de 1 · 2 usuários");
    // na própria linha os botões ficam desabilitados
    expect($("admin-linhas").querySelector('button[data-id="auth0|eu"]').disabled).toBe(true);

    $("admin-linhas").querySelector('button[data-acao="bloquear"][data-id="auth0|1"]').click();
    const form = $("admin-linhas").querySelector('form[data-acao="confirmar-bloqueio"]');
    form.elements.motivo.value = "spam";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await estabilizar();
    const patch = chamadas.find((c) => c.chave.startsWith("PATCH"));
    expect(patch.url).toBe("/api/usuarios/auth0%7C1/status");
    expect(patch.corpo).toEqual({ status: "BLOQUEADO", motivo: "spam" });
    expect($("admin-erro").textContent).toBe("ana foi bloqueado.");
    expect($("admin-linhas").textContent).toContain("Bloqueado");
  });

  it("mostra o erro da API na tela", async () => {
    rotas["GET /usuarios"] = [200, { itens: [outro], total: 1, pagina: 0, tamanho: 20 }];
    rotas["PATCH /usuarios/auth0%7C1/papel"] = [422, { detail: "Não permitido", status: 422 }];
    await iniciarApp();
    $("btn-admin").click();
    await estabilizar();
    $("admin-linhas").querySelector('button[data-acao="tornar-admin"]').click();
    await estabilizar();
    expect($("admin-erro").textContent).toBe("ana: Não permitido");
  });
});

describe("jogo com o servidor", () => {
  it("abre a sessão no servidor ao entrar no campo", async () => {
    rotas["POST /jogos/flecha/sessoes"] = [201, sessao()];
    await iniciarApp();
    $("btn-play").click();
    $("range-grid").querySelector('button[data-range="0"]').click();
    expect($("buy").classList.contains("show")).toBe(true);
    $("btn-enter").click();
    await estabilizar();
    const post = chamadas.find((c) => c.chave === "POST /jogos/flecha/sessoes");
    expect(post.corpo).toEqual({ campo: "vilarejo", flechas: { wood: 10, iron: 0, gold: 0, diamond: 0 } });
    expect(document.getElementById("wrap").dataset.state).toBe("playing");
  });

  it("saldo insuficiente (422) aparece na loja sem quebrar", async () => {
    rotas["POST /jogos/flecha/sessoes"] = [422, { detail: "Saldo insuficiente: disponivel 3", status: 422 }];
    await iniciarApp();
    $("btn-play").click();
    $("range-grid").querySelector('button[data-range="0"]').click();
    $("btn-enter").click();
    await estabilizar();
    expect($("buy").classList.contains("show")).toBe(true);
    expect($("buy-erro").hidden).toBe(false);
    expect($("buy-erro-texto").textContent).toBe("Saldo insuficiente: disponivel 3");
    expect($("btn-buy-fechar-aberta").hidden).toBe(true);
    expect($("btn-enter").disabled).toBe(false);
  });

  it("rodada já aberta (409) oferece encerrá-la", async () => {
    rotas["POST /jogos/flecha/sessoes"] = [409, { detail: "Já existe sessão aberta", status: 409 }];
    await iniciarApp();
    $("btn-play").click();
    $("range-grid").querySelector('button[data-range="0"]').click();
    $("btn-enter").click();
    await estabilizar();
    expect($("btn-buy-fechar-aberta").hidden).toBe(false);

    rotas["GET /jogos/flecha/sessoes/atual"] = [200, sessao()];
    rotas["POST /jogos/flecha/sessoes/s-1/encerrar"] = [200, sessao({ status: "ENCERRADA" })];
    $("btn-buy-fechar-aberta").click();
    await estabilizar();
    expect(chamadas.map((c) => c.chave)).toContain("POST /jogos/flecha/sessoes/s-1/encerrar");
    expect($("buy-erro").hidden).toBe(true);
  });

  it("sair do campo encerra a sessão e mostra o resultado do servidor", async () => {
    rotas["POST /jogos/flecha/sessoes"] = [201, sessao()];
    rotas["POST /jogos/flecha/sessoes/s-1/encerrar"] = [200, sessao({
      status: "ENCERRADA", ganhos: 40, resultado: 25, acertos: 3,
      disparadas: { wood: 4, iron: 0, gold: 0, diamond: 0 },
    })];
    await iniciarApp();
    $("btn-play").click();
    $("range-grid").querySelector('button[data-range="0"]').click();
    $("btn-enter").click();
    await estabilizar();
    $("btn-pause").click();
    expect($("pause").classList.contains("show")).toBe(true);
    $("btn-quit").click();
    await estabilizar();
    expect($("result").classList.contains("show")).toBe(true);
    expect($("res-title").textContent).toBe("Lucro!");
    expect($("res-net").textContent).toBe("+25");
    expect($("res-hits").textContent).toBe("3 com 4 flechas");
    expect($("res-earned").textContent).toBe("+40");
    expect($("res-wallet").textContent).toBe("1.025");
  });
});
