import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api.js";
import { ErroApi, SEM_CONEXAO, configurarApi, ehContaBloqueada, mensagemPadrao } from "./api.js";

/** Resposta falsa no formato do fetch. */
function resposta(status, corpo, tipo = "application/json") {
  const texto = corpo === undefined ? "" : typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === "content-type" ? tipo : null) },
    text: async () => texto,
  };
}

let fetchFalso, aoNaoAutorizado, aoContaBloqueada;

function configurar(respostaPadrao = resposta(200, {})) {
  fetchFalso = vi.fn(async () => respostaPadrao);
  aoNaoAutorizado = vi.fn();
  aoContaBloqueada = vi.fn();
  configurarApi({ obterToken: async () => "tok-123", fetch: fetchFalso, aoNaoAutorizado, aoContaBloqueada });
}

const ultimaChamada = () => {
  const [url, init] = fetchFalso.mock.calls.at(-1);
  return { url, ...init, corpo: init.body ? JSON.parse(init.body) : undefined };
};

beforeEach(() => configurar());
afterEach(() => configurarApi());

describe("cabeçalhos e corpo", () => {
  it("manda o token Bearer e Accept JSON", async () => {
    await api.carteira();
    const c = ultimaChamada();
    expect(c.url).toBe("/api/carteira");
    expect(c.method).toBe("GET");
    expect(c.headers).toEqual({ Accept: "application/json", Authorization: "Bearer tok-123" });
    expect(c.body).toBeUndefined();
  });

  it("serializa o corpo em JSON com Content-Type", async () => {
    await api.atualizarApelido("arqueiro_1");
    const c = ultimaChamada();
    expect(c.method).toBe("PATCH");
    expect(c.url).toBe("/api/usuarios/me");
    expect(c.headers["Content-Type"]).toBe("application/json");
    expect(c.corpo).toEqual({ apelido: "arqueiro_1" });
  });

  it("rota pública não pede token", async () => {
    const obterToken = vi.fn();
    configurarApi({ obterToken });
    await api.regrasFlecha();
    expect(obterToken).not.toHaveBeenCalled();
    expect(ultimaChamada().headers.Authorization).toBeUndefined();
    expect(ultimaChamada().url).toBe("/api/jogos/flecha/regras");
  });

  it("usa a base configurada", async () => {
    configurarApi({ base: "http://gateway:8080/api" });
    await api.extrato();
    expect(ultimaChamada().url).toBe("http://gateway:8080/api/carteira/extrato");
  });
});

describe("rotas", () => {
  it("estudo da flecha bitcoin: registra a previsão e consulta a operação", async () => {
    const dados = { sessaoId: "s-1", direcao: "ALTA", precoAgora: 83000, precoPrevisto: 83010 };
    await api.registrarOperacaoEstudo(dados);
    expect(ultimaChamada().method).toBe("POST");
    expect(ultimaChamada().url).toBe("/api/jogos/flecha/estudo/operacoes");
    expect(ultimaChamada().corpo).toEqual(dados);
    await api.aljavaGuardada();
    expect(ultimaChamada().url).toBe("/api/jogos/flecha/aljava");
    await api.meusAcertos();
    expect(ultimaChamada().url).toBe("/api/jogos/flecha/estudo/meus-acertos");
    await api.meusAcertos("s-9");
    expect(ultimaChamada().url).toBe("/api/jogos/flecha/estudo/meus-acertos?sessaoId=s-9");
    await api.operacaoEstudo("op 1");
    expect(ultimaChamada().method).toBe("GET");
    expect(ultimaChamada().url).toBe("/api/jogos/flecha/estudo/operacoes/op%201");
  });

  it("codifica ids com | nos caminhos", async () => {
    await api.alterarStatus("auth0|abc 1", "BLOQUEADO", "trapaça");
    expect(ultimaChamada().url).toBe("/api/usuarios/auth0%7Cabc%201/status");
    expect(ultimaChamada().corpo).toEqual({ status: "BLOQUEADO", motivo: "trapaça" });

    await api.alterarStatus("google-oauth2|9", "ATIVO");
    expect(ultimaChamada().url).toBe("/api/usuarios/google-oauth2%7C9/status");
    expect(ultimaChamada().corpo).toEqual({ status: "ATIVO" });

    await api.alterarPapel("auth0|x/y", "ADMIN");
    expect(ultimaChamada().url).toBe("/api/usuarios/auth0%7Cx%2Fy/papel");
    expect(ultimaChamada().corpo).toEqual({ papel: "ADMIN" });
  });

  it("monta a busca de usuários sem parâmetros vazios", async () => {
    await api.listarUsuarios({ busca: "  ana ", status: "ATIVO", papel: "", pagina: 2, tamanho: 10 });
    expect(ultimaChamada().url).toBe("/api/usuarios?busca=ana&status=ATIVO&pagina=2&tamanho=10");
    await api.listarUsuarios();
    expect(ultimaChamada().url).toBe("/api/usuarios?pagina=0&tamanho=20");
  });

  it("perfil e exclusão de conta", async () => {
    await api.meuPerfil();
    expect(ultimaChamada()).toMatchObject({ url: "/api/usuarios/me", method: "GET" });
    configurar(resposta(204));
    expect(await api.excluirConta()).toBeNull();
    expect(ultimaChamada()).toMatchObject({ url: "/api/usuarios/me", method: "DELETE" });
  });

  it("compra de moedas vira um depósito na carteira", async () => {
    await api.comprarMoedas(500);
    expect(ultimaChamada()).toMatchObject({ url: "/api/carteira/depositos", method: "POST", corpo: { valor: 500 } });
  });

  it("compra por Pix", async () => {
    const id = "6f1c2a3b-0000-4000-8000-0000000000aa";
    await api.configCompras();
    expect(ultimaChamada()).toMatchObject({ url: "/api/carteira/compras/config", method: "GET" });
    await api.iniciarCompraPix(1000);
    expect(ultimaChamada()).toMatchObject({ url: "/api/carteira/compras", method: "POST", corpo: { moedas: 1000 } });
    await api.consultarCompraPix(id);
    expect(ultimaChamada()).toMatchObject({ url: `/api/carteira/compras/${id}`, method: "GET" });
    await api.simularPagamentoPix(id);
    expect(ultimaChamada()).toMatchObject({ url: `/api/carteira/compras/${id}/simular-pagamento`, method: "POST" });
  });

  it("sessões do Flecha Certeira", async () => {
    const id = "6f1c2a3b-0000-4000-8000-000000000001";
    await api.abrirSessao("bosque", { wood: 10, iron: 5 });
    expect(ultimaChamada()).toMatchObject({ url: "/api/jogos/flecha/sessoes", method: "POST" });
    expect(ultimaChamada().corpo).toEqual({ campo: "bosque", flechas: { wood: 10, iron: 5 } });

    await api.registrarTiro(id, "gold", ["red", "big"]);
    expect(ultimaChamada().url).toBe(`/api/jogos/flecha/sessoes/${id}/tiros`);
    expect(ultimaChamada().corpo).toEqual({ flecha: "gold", acertos: ["red", "big"] });

    await api.comprarFlechas(id, "iron", 5);
    expect(ultimaChamada().url).toBe(`/api/jogos/flecha/sessoes/${id}/flechas`);
    expect(ultimaChamada().corpo).toEqual({ flecha: "iron", quantidade: 5 });

    await api.encerrarSessao(id);
    expect(ultimaChamada()).toMatchObject({ url: `/api/jogos/flecha/sessoes/${id}/encerrar`, method: "POST", body: undefined });

    await api.sessaoAtual();
    expect(ultimaChamada().url).toBe("/api/jogos/flecha/sessoes/atual");
  });

  it("sessão atual: 204 vira null", async () => {
    configurar(resposta(204));
    expect(await api.sessaoAtual()).toBeNull();
  });

  it("devolve o JSON da resposta", async () => {
    configurar(resposta(200, { saldo: 1000.5 }));
    expect(await api.carteira()).toEqual({ saldo: 1000.5 });
  });

  it("aceita JSON sem content-type e corpo vazio", async () => {
    configurar(resposta(200, '{"a":1}', ""));
    expect(await api.carteira()).toEqual({ a: 1 });
    configurar(resposta(200, ""));
    expect(await api.carteira()).toBeNull();
  });
});

describe("erros", () => {
  async function erroDe(promessa) {
    try {
      await promessa;
    } catch (e) {
      return e;
    }
    throw new Error("deveria falhar");
  }

  it("lê o detail do ProblemDetail", async () => {
    configurar(resposta(422, { type: "about:blank", title: "Unprocessable Entity", status: 422, detail: "Saldo insuficiente: disponivel 3" }, "application/problem+json"));
    const e = await erroDe(api.abrirSessao("pico", { wood: 1 }));
    expect(e).toBeInstanceOf(ErroApi);
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(422);
    expect(e.mensagem).toBe("Saldo insuficiente: disponivel 3");
    expect(e.message).toBe("Saldo insuficiente: disponivel 3");
    expect(e.corpo.title).toBe("Unprocessable Entity");
  });

  it("sem detail usa o title", async () => {
    configurar(resposta(409, { title: "Apelido em uso", status: 409 }, "application/problem+json"));
    expect((await erroDe(api.atualizarApelido("ana"))).mensagem).toBe("Apelido em uso");
  });

  it("sem corpo usa a mensagem padrão do status", async () => {
    configurar(resposta(404));
    expect((await erroDe(api.carteira())).mensagem).toBe(mensagemPadrao(404));
    configurar(resposta(502, "<html>Bad Gateway</html>", "text/html"));
    const e = await erroDe(api.carteira());
    expect(e.status).toBe(502);
    expect(e.mensagem).toBe("Servidor indisponível. Tente de novo em instantes.");
  });

  it("texto simples curto vira a mensagem; JSON quebrado não derruba", async () => {
    configurar(resposta(400, "Campo inválido", "text/plain"));
    expect((await erroDe(api.carteira())).mensagem).toBe("Campo inválido");
    configurar(resposta(400, "{quebrado", "application/json"));
    expect((await erroDe(api.carteira())).mensagem).toBe("{quebrado");
  });

  it("mensagens padrão", () => {
    expect(mensagemPadrao(429)).toMatch(/Muitas/);
    expect(mensagemPadrao(503)).toMatch(/indisponível/);
    expect(mensagemPadrao(418)).toBe("Erro 418.");
  });

  it("falha de rede vira status 0 'Sem conexão com o servidor'", async () => {
    fetchFalso.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const e = await erroDe(api.carteira());
    expect(e.status).toBe(0);
    expect(e.mensagem).toBe(SEM_CONEXAO);
    expect(aoNaoAutorizado).not.toHaveBeenCalled();
  });

  it("401 chama o gancho de novo login", async () => {
    configurar(resposta(401, { title: "Unauthorized", status: 401 }));
    const e = await erroDe(api.carteira());
    expect(e.status).toBe(401);
    expect(aoNaoAutorizado).toHaveBeenCalledWith(e);
    expect(aoContaBloqueada).not.toHaveBeenCalled();
  });

  it("sem token (login expirado) também conta como 401, sem chamar a rede", async () => {
    configurarApi({ obterToken: async () => { throw new Error("login_required"); } });
    const e = await erroDe(api.meuPerfil());
    expect(e.status).toBe(401);
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(aoNaoAutorizado).toHaveBeenCalledTimes(1);

    configurarApi({ obterToken: null });
    expect((await erroDe(api.meuPerfil())).status).toBe(401);
  });

  it("403 de conta bloqueada chama o gancho", async () => {
    configurar(resposta(403, { detail: "Conta bloqueada", status: 403 }));
    const e = await erroDe(api.carteira());
    expect(aoContaBloqueada).toHaveBeenCalledWith(e);
    expect(aoNaoAutorizado).not.toHaveBeenCalled();
  });

  it("403 numa rota de administração por falta de permissão não é conta bloqueada", async () => {
    configurar(resposta(403, { detail: "Apenas administradores", status: 403 }));
    const e = await erroDe(api.listarUsuarios());
    expect(e.status).toBe(403);
    expect(aoContaBloqueada).not.toHaveBeenCalled();

    configurar(resposta(403, { detail: "Conta excluída", status: 403 }));
    await erroDe(api.alterarPapel("auth0|1", "ADMIN"));
    expect(aoContaBloqueada).toHaveBeenCalledTimes(1);
  });

  it("ehContaBloqueada", () => {
    const e403 = (m) => new ErroApi(403, m);
    expect(ehContaBloqueada(e403("Acesso negado"), "/usuarios/me")).toBe(true);
    expect(ehContaBloqueada(e403("Acesso negado"), "/carteira")).toBe(true);
    expect(ehContaBloqueada(e403("Acesso negado"), "/usuarios?pagina=0")).toBe(false);
    expect(ehContaBloqueada(e403("Conta bloqueada"), "/usuarios/x/status")).toBe(true);
    expect(ehContaBloqueada(new ErroApi(401, "x"), "/carteira")).toBe(false);
    expect(ehContaBloqueada(new Error("x"), "/carteira")).toBe(false);
  });

  it("sem ganchos configurados apenas lança o erro", async () => {
    configurarApi({ aoNaoAutorizado: null, aoContaBloqueada: null });
    configurar(resposta(401));
    configurarApi({ aoNaoAutorizado: null });
    expect((await erroDe(api.carteira())).status).toBe(401);
  });

  it("fetch padrão usa o fetch global", async () => {
    configurarApi();
    configurarApi({ obterToken: async () => "t" });
    const global = vi.fn(async () => resposta(200, { ok: true }));
    vi.stubGlobal("fetch", global);
    try {
      expect(await api.carteira()).toEqual({ ok: true });
      expect(global).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
