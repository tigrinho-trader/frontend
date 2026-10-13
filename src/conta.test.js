// @vitest-environment jsdom
// Teste de fumaça das telas: carrega o index.html de verdade, o jogo e a conta,
// com o login (OIDC) e o api-gateway falsos (fetch simulado).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HTML = readFileSync(resolve(process.cwd(), "index.html"), "utf-8");

// Login falso, controlado por cada teste
const authFalso = {
  configurado: true,
  autenticado: true,
  erro: null,
  falhaIniciar: null,
  falhaEntrar: null,
};
vi.mock("./auth.js", () => ({
  configurado: () => authFalso.configurado,
  faltando: () => [],
  provedor: () => ({ nome: "keycloak", endereco: "http://localhost:8180" }),
  iniciar: async () => {
    if (authFalso.falhaIniciar) throw authFalso.falhaIniciar;
    return { autenticado: authFalso.autenticado, erro: authFalso.erro };
  },
  entrar: vi.fn(async () => {
    if (authFalso.falhaEntrar) throw authFalso.falhaEntrar;
  }),
  sair: vi.fn(async () => {}),
  token: async () => "tok",
  usuarioOidc: async () => null,
}));

/** Erro como o ErroLogin do auth.js (servidor de login fora do ar). */
const SERVIDOR_FORA = "Não foi possível falar com o servidor de login (http://localhost:8180). Ele está no ar? Suba com docker compose.";
function erroServidorFora() {
  return Object.assign(new Error(SERVIDOR_FORA), { name: "ErroLogin", servidorFora: true });
}

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
  authFalso.falhaIniciar = null;
  authFalso.falhaEntrar = null;
  sessionStorage.clear();
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
  it("com AUTHORITY/CLIENT_ID vazios mostra o aviso e trava os botões", async () => {
    authFalso.configurado = false;
    await iniciarApp();
    expect($("menu").dataset.conta).toBe("anonimo");
    expect($("aviso-config").hidden).toBe(false);
    expect($("aviso-config").textContent).toContain("Login não configurado — defina VITE_OIDC_AUTHORITY e VITE_OIDC_CLIENT_ID");
    expect($("aviso-config").textContent).not.toMatch(/AUTH0/);
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

  it("servidor de login fora do ar: aviso claro no menu e botões liberados para tentar de novo", async () => {
    authFalso.falhaIniciar = erroServidorFora();
    await iniciarApp();
    expect($("menu").dataset.conta).toBe("anonimo");
    expect($("menu-aviso").hidden).toBe(false);
    expect($("menu-aviso").textContent).toBe(SERVIDOR_FORA);
    expect($("btn-entrar").disabled).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("outra falha ao iniciar o login aparece com o motivo", async () => {
    authFalso.falhaIniciar = new Error("algo estranho");
    await iniciarApp();
    expect($("menu-aviso").textContent).toBe("Não foi possível iniciar o login: algo estranho");
  });

  it("Entrar com o servidor de login fora do ar mostra o aviso", async () => {
    authFalso.autenticado = false;
    await iniciarApp();
    authFalso.falhaEntrar = erroServidorFora();
    $("btn-entrar").click();
    await estabilizar();
    expect($("menu-aviso").textContent).toBe(SERVIDOR_FORA);
  });

  it("401 da API volta ao login; se o servidor de login não responde, avisa no menu", async () => {
    rotas["GET /usuarios/me"] = [401, { detail: "Token inválido", status: 401 }];
    authFalso.falhaEntrar = erroServidorFora();
    await iniciarApp();
    const auth = await import("./auth.js");
    expect(auth.entrar).toHaveBeenCalledWith();
    expect($("menu").dataset.conta).toBe("anonimo");
    expect($("menu-aviso").textContent).toBe(SERVIDOR_FORA);
  });

  it("401 repetido em menos de 30 s não entra em laço: mostra o erro sem citar Auth0", async () => {
    rotas["GET /usuarios/me"] = [401, { detail: "Token inválido", status: 401 }];
    sessionStorage.setItem("flecha-certeira-relogin", String(Date.now()));
    await iniciarApp();
    expect($("menu").dataset.conta).toBe("erro");
    expect($("menu-erro").textContent).toContain("VITE_OIDC_AUTHORITY");
    expect($("menu-erro").textContent).not.toMatch(/AUTH0/);
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

  it("Saldo: moedas, valor de referência, flechas guardadas e movimentações", async () => {
    rotas["GET /jogos/flecha/aljava"] = [200, {
      campos: { vilarejo: { wood: 3, iron: 0, gold: 0, diamond: 0 }, bosque: { wood: 0, iron: 0, gold: 0, diamond: 0 } },
      mercado: { btc: 2, eth: 0, ouro: 1 },
    }];
    await iniciarApp();
    expect($("btn-sacar").disabled).toBe(true);           // saque ainda não existe
    $("btn-saldo").click();
    await estabilizar();
    expect($("saldo").classList.contains("show")).toBe(true);
    expect($("saldo-moedas").textContent).toBe("1.000");
    expect($("saldo-referencia").textContent.replace(/\s/g, " ")).toContain("R$ 100,00");
    const aljava = $("saldo-aljava").textContent;
    expect(aljava).toContain("Mercado (qualquer campo): 2 bitcoin, 1 ouro paxg");
    expect(aljava).toContain("Campo do Vilarejo: 3 madeira");
    expect(aljava).not.toContain("Bosque");
    expect($("saldo-extrato").textContent).toContain("Bônus inicial");

    // comprar a partir do saldo volta para o saldo
    $("btn-saldo-comprar").click();
    expect($("wrap").dataset.state).toBe("creditos");
    $("btn-creditos-voltar").click();
    await estabilizar();
    expect($("wrap").dataset.state).toBe("saldo");
    $("btn-saldo-voltar").click();
    expect($("wrap").dataset.state).toBe("menu");
  });

  it("Saldo sem flechas guardadas, ou com a aljava fora do ar", async () => {
    rotas["GET /jogos/flecha/aljava"] = [200, { campos: {}, mercado: {} }];
    await iniciarApp();
    $("btn-saldo").click();
    await estabilizar();
    expect($("saldo-aljava").textContent).toContain("Nenhuma flecha guardada");

    rotas["GET /jogos/flecha/aljava"] = [503, { detail: "trading fora", status: 503 }];
    $("btn-saldo-voltar").click();
    $("btn-saldo").click();
    await estabilizar();
    expect($("saldo-aljava").querySelector(".erro")).not.toBeNull();
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
    expect(post.corpo).toEqual({ campo: "vilarejo", flechas: { wood: 10, iron: 0, gold: 0, diamond: 0, btc: 0, eth: 0, ouro: 0 } });
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

describe("comprar moedas", () => {
  it("pelo menu: escolhe o pacote, confirma e o saldo novo aparece", async () => {
    let saldo = 1000;
    rotas["GET /carteira"] = () => [200, { usuarioId: EU.id, saldo, atualizadaEm: null }];
    rotas["POST /carteira/depositos"] = (init) => {
      saldo += JSON.parse(init.body).valor;
      return [200, { usuarioId: EU.id, saldo, atualizadaEm: null }];
    };
    await iniciarApp();

    $("btn-comprar").click();
    expect($("wrap").dataset.state).toBe("creditos");
    expect($("creditos-saldo").textContent).toBe("1.000");
    expect($("creditos-confirmar").hidden).toBe(true);

    $("creditos-pacotes").querySelector('[data-pacote="bau"]').click();
    expect($("creditos-confirmar").hidden).toBe(false);
    expect($("creditos-qtd").textContent).toBe("1.000");

    $("btn-creditos-pagar").click();
    await estabilizar();
    expect(chamadas.find((c) => c.chave === "POST /carteira/depositos").corpo).toEqual({ valor: 1000 });
    expect($("creditos-msg").textContent).toContain("1.000 moedas entraram na sua carteira");
    expect($("creditos-saldo").textContent).toBe("2.000");
    expect($("creditos-confirmar").hidden).toBe(true);

    $("btn-creditos-voltar").click();
    expect($("wrap").dataset.state).toBe("menu");
    expect($("menu-wallet").textContent).toBe("2.000");
  });

  it("no pagamento de teste também dá para digitar o valor", async () => {
    rotas["POST /carteira/depositos"] = [200, { usuarioId: EU.id, saldo: 1120, atualizadaEm: null }];
    await iniciarApp();
    $("btn-comprar").click();
    await estabilizar();
    const campo = $("creditos-valor");
    campo.value = "12";
    campo.dispatchEvent(new Event("input"));
    expect($("creditos-qtd").textContent).toBe("120");
    expect($("creditos-preco").textContent).toBe(" na sua carteira");
    campo.value = "501";
    campo.dispatchEvent(new Event("input"));
    expect($("creditos-valor-dica").textContent.replace(/\s/g, " ")).toBe("Escolha um valor de R$ 1 a R$ 500.");
    campo.value = "12";
    campo.dispatchEvent(new Event("input"));
    $("btn-creditos-pagar").click();
    await estabilizar();
    expect(chamadas.find((c) => c.chave === "POST /carteira/depositos").corpo).toEqual({ valor: 120 });
    expect($("creditos-msg").textContent).toContain("120 moedas entraram");
    expect($("creditos-valor").value).toBe("");
  });

  it("compra desligada na carteira mostra o aviso e não muda o saldo", async () => {
    rotas["POST /carteira/depositos"] = [422, { detail: "Pagamentos desabilitados" }];
    await iniciarApp();
    $("btn-comprar").click();
    $("creditos-pacotes").querySelector('[data-pacote="punhado"]').click();
    $("btn-creditos-pagar").click();
    await estabilizar();
    expect($("creditos-msg").textContent).toContain("desligada");
    expect($("creditos-msg").className).toContain("erro");
    expect($("creditos-saldo").textContent).toBe("1.000");
    expect($("btn-creditos-pagar").disabled).toBe(false);
  });

  it("saldo insuficiente na loja de flechas oferece comprar moedas e volta para a loja", async () => {
    rotas["POST /jogos/flecha/sessoes"] = [422, { detail: "Saldo insuficiente: disponivel 3" }];
    await iniciarApp();
    $("btn-play").click();
    $("range-grid").querySelector('button[data-range="0"]').click();
    $("btn-enter").click();
    await estabilizar();
    expect($("buy-erro").hidden).toBe(false);
    expect($("btn-buy-comprar").hidden).toBe(false);

    $("btn-buy-comprar").click();
    expect($("wrap").dataset.state).toBe("creditos");
    $("btn-creditos-voltar").click();
    expect($("wrap").dataset.state).toBe("buy");
    expect($("buy-erro").hidden).toBe(true);
  });

  it("outros erros da loja não oferecem a compra", async () => {
    rotas["POST /jogos/flecha/sessoes"] = [409, { detail: "Ja existe uma sessao aberta" }];
    await iniciarApp();
    $("btn-play").click();
    $("range-grid").querySelector('button[data-range="0"]').click();
    $("btn-enter").click();
    await estabilizar();
    expect($("buy-erro").hidden).toBe(false);
    expect($("btn-buy-comprar").hidden).toBe(true);
  });

  it("a escolha de campo também leva à compra", async () => {
    await iniciarApp();
    $("btn-play").click();
    $("btn-ranges-comprar").click();
    expect($("wrap").dataset.state).toBe("creditos");
    $("btn-creditos-voltar").click();
    expect($("wrap").dataset.state).toBe("ranges");
  });
});

describe("comprar moedas por Pix", () => {
  const QR = "data:image/png;base64,iVBORw0KGgo=";
  function compra(extra = {}) {
    return {
      id: "c-1", moedas: 1000, centavos: 10000, status: "PENDENTE", brCode: "00020126pix-copia-e-cola",
      brCodeBase64: QR, expiraEm: new Date(Date.now() + 30 * 60_000).toISOString(), devMode: true,
      criadaEm: null, pagaEm: null, saldo: null, ...extra,
    };
  }

  beforeEach(() => {
    rotas["GET /carteira/compras/config"] = [200, { pixHabilitado: true, sandboxHabilitado: true, pacotes: [100, 500, 1000, 5000], centavosPorMoeda: 10 }];
    rotas["POST /carteira/compras"] = [201, compra()];
  });

  async function abrirEGerarPix() {
    await iniciarApp();
    $("btn-comprar").click();
    await estabilizar();
    expect($("creditos-pacotes").textContent.replace(/\s/g, " ")).toContain("R$ 10,00");
    $("creditos-pacotes").querySelector('[data-pacote="p1000"]').click();
    expect($("btn-creditos-pagar").textContent).toBe("Gerar Pix");
    expect($("creditos-preco").textContent.replace(/\s/g, " ")).toBe(" por R$ 100,00");
    expect($("creditos-aviso-sandbox").hidden).toBe(true);
    $("btn-creditos-pagar").click();
    await estabilizar();
  }

  it("gera o Pix com QR Code e copia e cola, e a simulação credita", async () => {
    let saldo = 1000;
    rotas["GET /carteira"] = () => [200, { usuarioId: EU.id, saldo, atualizadaEm: null }];
    rotas["POST /carteira/compras/c-1/simular-pagamento"] = () => {
      saldo = 2000;
      return [200, compra({ status: "PAGA", saldo: 2000 })];
    };
    await abrirEGerarPix();

    expect(chamadas.find((c) => c.chave === "POST /carteira/compras").corpo).toEqual({ moedas: 1000 });
    expect($("creditos-pix").hidden).toBe(false);
    expect($("creditos-pacotes").hidden).toBe(true);
    expect($("pix-qr").getAttribute("src")).toBe(QR);
    expect($("pix-copia").value).toBe("00020126pix-copia-e-cola");
    expect($("pix-tempo").textContent).toMatch(/^\d\d:\d\d$/);
    expect($("btn-pix-simular").hidden).toBe(false);
    expect($("pix-aviso-dev").hidden).toBe(false);

    $("btn-pix-simular").click();
    await estabilizar();
    expect($("creditos-pix").hidden).toBe(true);
    expect($("creditos-msg").textContent).toContain("Pagamento confirmado! 1.000 moedas");
    expect($("creditos-saldo").textContent).toBe("2.000");
    $("btn-creditos-voltar").click();
    expect($("menu-wallet").textContent).toBe("2.000");
  });

  it("o jogador digita quanto quer colocar e o Pix sai com essa quantidade", async () => {
    rotas["GET /carteira/compras/config"] = [200, {
      pixHabilitado: true, sandboxHabilitado: true, pacotes: [100, 500, 1000, 5000], centavosPorMoeda: 10,
      minimoMoedas: 10, maximoMoedas: 10000,
    }];
    await iniciarApp();
    $("btn-comprar").click();
    await estabilizar();
    const campo = $("creditos-valor");
    const digitar = (texto) => { campo.value = texto; campo.dispatchEvent(new Event("input")); };
    expect($("creditos-valor-livre").hidden).toBe(false);
    expect($("creditos-valor-moedas").textContent).toBe("R$ 1 = 10 moedas");
    expect($("creditos-valor-dica").textContent.replace(/\s/g, " ")).toBe("Valores de R$ 1 a R$ 1.000.");

    digitar("2,50");
    expect($("creditos-valor-dica").className).toContain("erro");
    expect($("creditos-confirmar").hidden).toBe(true);

    digitar("50");
    expect($("creditos-pacotes").querySelector(".selecionado").dataset.pacote).toBe("p500");
    digitar("37");
    expect($("creditos-pacotes").querySelector(".selecionado")).toBeNull();
    expect($("creditos-valor-dica").className).not.toContain("erro");
    expect($("creditos-confirmar").hidden).toBe(false);
    expect($("creditos-qtd").textContent).toBe("370");
    expect($("creditos-preco").textContent.replace(/\s/g, " ")).toBe(" por R$ 37,00");

    campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await estabilizar();
    expect(chamadas.find((c) => c.chave === "POST /carteira/compras").corpo).toEqual({ moedas: 370 });
    expect($("creditos-valor-livre").hidden).toBe(true);
  });

  it("clicar num pacote preenche o valor em reais", async () => {
    await iniciarApp();
    $("btn-comprar").click();
    await estabilizar();
    $("creditos-pacotes").querySelector('[data-pacote="p5000"]').click();
    expect($("creditos-valor").value).toBe("500");
    expect($("creditos-qtd").textContent).toBe("5.000");
  });

  it("'Já paguei' com o Pix ainda pendente avisa e continua esperando", async () => {
    rotas["GET /carteira/compras/c-1"] = [200, compra()];
    await abrirEGerarPix();
    $("btn-pix-verificar").click();
    await estabilizar();
    expect($("creditos-msg").textContent).toContain("Ainda não recebemos o pagamento");
    expect($("creditos-pix").hidden).toBe(false);
  });

  it("Pix expirado volta para a escolha de pacotes com o aviso", async () => {
    rotas["GET /carteira/compras/c-1"] = [200, compra({ status: "EXPIRADA" })];
    await abrirEGerarPix();
    $("btn-pix-verificar").click();
    await estabilizar();
    expect($("creditos-msg").textContent).toContain("expirou");
    expect($("creditos-pix").hidden).toBe(true);
    expect($("creditos-pacotes").hidden).toBe(false);
  });

  it("cobrança fora do modo de teste não mostra o botão de simular; QR suspeito não é exibido", async () => {
    rotas["POST /carteira/compras"] = [201, compra({ devMode: false, brCodeBase64: "https://evil.example/qr.png" })];
    await abrirEGerarPix();
    expect($("btn-pix-simular").hidden).toBe(true);
    expect($("pix-qr").hidden).toBe(true);
  });

  it("erro do Pix ao gerar mostra a mensagem e mantém os pacotes", async () => {
    rotas["POST /carteira/compras"] = [503, { detail: "AbacatePay indisponivel" }];
    await abrirEGerarPix();
    expect($("creditos-msg").textContent).toContain("O Pix está indisponível agora");
    expect($("creditos-pix").hidden).toBe(true);
  });

  it("loja desligada quando não há Pix nem pagamento de teste", async () => {
    rotas["GET /carteira/compras/config"] = [200, { pixHabilitado: false, sandboxHabilitado: false, pacotes: [], centavosPorMoeda: 1 }];
    await iniciarApp();
    $("btn-comprar").click();
    await estabilizar();
    expect($("creditos-indisponivel").hidden).toBe(false);
    expect($("creditos-pacotes").hidden).toBe(true);
  });
});
