import { describe, expect, it, vi } from "vitest";
import * as modulo from "./auth.js";
import { criarAuth, lerConfiguracao } from "./auth.js";

const ENV = {
  VITE_AUTH0_DOMAIN: "tigrinho-trader.us.auth0.com",
  VITE_AUTH0_CLIENT_ID: "abc123",
  VITE_AUTH0_AUDIENCE: "https://api.tigrinho-trader",
};

function clienteFalso({ autenticado = true, falhaCallback = null } = {}) {
  return {
    handleRedirectCallback: vi.fn(async () => {
      if (falhaCallback) throw falhaCallback;
      return {};
    }),
    isAuthenticated: vi.fn(async () => autenticado),
    loginWithRedirect: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    getTokenSilently: vi.fn(async () => "token-jwt"),
    getUser: vi.fn(async () => ({ name: "Ana", email: "ana@x.com" })),
  };
}

function janelaFalsa(search = "") {
  return {
    location: { origin: "http://localhost:5173", pathname: "/", search, hash: "" },
    history: { replaceState: vi.fn() },
    document: { title: "Flecha Certeira" },
  };
}

function montar({ env = ENV, cliente = clienteFalso(), search = "" } = {}) {
  const janela = janelaFalsa(search);
  const criarCliente = vi.fn(async () => cliente);
  const auth = criarAuth({ env, criarCliente, janela });
  return { auth, cliente, criarCliente, janela };
}

describe("configuração", () => {
  it("lê as três variáveis do Vite e ignora espaços", () => {
    expect(lerConfiguracao({ ...ENV, VITE_AUTH0_CLIENT_ID: "  abc  " })).toEqual({
      domain: ENV.VITE_AUTH0_DOMAIN,
      clientId: "abc",
      audience: ENV.VITE_AUTH0_AUDIENCE,
    });
  });

  it("não está configurado se faltar qualquer variável", () => {
    for (const chave of Object.keys(ENV)) {
      const { auth } = montar({ env: { ...ENV, [chave]: "" } });
      expect(auth.configurado()).toBe(false);
      expect(auth.faltando()).toEqual([chave]);
    }
    expect(montar().auth.configurado()).toBe(true);
    expect(criarAuth({ env: {} }).faltando()).toHaveLength(3);
  });

  it("sem configuração: iniciar não cria cliente e as ações falham com mensagem clara", async () => {
    const { auth, criarCliente } = montar({ env: {} });
    expect(await auth.iniciar()).toEqual({ autenticado: false, erro: null });
    expect(criarCliente).not.toHaveBeenCalled();
    await expect(auth.entrar()).rejects.toThrow("Login não configurado");
    await expect(auth.token()).rejects.toThrow("Login não configurado");
    expect(await auth.usuarioAuth0()).toBeNull();
  });

  it("a instância padrão do módulo expõe as funções", () => {
    expect(typeof modulo.configurado()).toBe("boolean");
    expect(Array.isArray(modulo.faltando())).toBe(true);
    for (const f of ["iniciar", "entrar", "sair", "token", "usuarioAuth0"]) expect(typeof modulo[f]).toBe("function");
  });
});

describe("iniciar", () => {
  it("cria o cliente com cache local, refresh token, redirect_uri e audience", async () => {
    const { auth, criarCliente } = montar();
    expect(await auth.iniciar()).toEqual({ autenticado: true, erro: null });
    expect(criarCliente).toHaveBeenCalledWith({
      domain: ENV.VITE_AUTH0_DOMAIN,
      clientId: "abc123",
      cacheLocation: "localstorage",
      useRefreshTokens: true,
      authorizationParams: { redirect_uri: "http://localhost:5173", audience: ENV.VITE_AUTH0_AUDIENCE },
    });
  });

  it("cria o cliente uma vez só", async () => {
    const { auth, criarCliente } = montar();
    await auth.iniciar();
    await auth.iniciar();
    expect(criarCliente).toHaveBeenCalledTimes(1);
  });

  it("conclui o retorno do Auth0 (?code=&state=) e limpa a URL", async () => {
    const { auth, cliente, janela } = montar({ search: "?code=xyz&state=abc" });
    expect(await auth.iniciar()).toEqual({ autenticado: true, erro: null });
    expect(cliente.handleRedirectCallback).toHaveBeenCalledTimes(1);
    expect(janela.history.replaceState).toHaveBeenCalledWith({}, "Flecha Certeira", "/");
  });

  it("não chama o callback sem code e state", async () => {
    const { auth, cliente, janela } = montar({ search: "?code=xyz" });
    await auth.iniciar();
    expect(cliente.handleRedirectCallback).not.toHaveBeenCalled();
    expect(janela.history.replaceState).not.toHaveBeenCalled();
  });

  it("devolve o erro do callback e limpa a URL mesmo assim", async () => {
    const falha = Object.assign(new Error("Invalid state"), { error_description: "Estado inválido" });
    const cliente = clienteFalso({ autenticado: false, falhaCallback: falha });
    const { auth, janela } = montar({ cliente, search: "?code=1&state=2" });
    expect(await auth.iniciar()).toEqual({ autenticado: false, erro: "Estado inválido" });
    expect(janela.history.replaceState).toHaveBeenCalled();
  });

  it("usa a mensagem do erro quando não há error_description", async () => {
    const cliente = clienteFalso({ autenticado: false, falhaCallback: new Error("falhou") });
    const { auth } = montar({ cliente, search: "?code=1&state=2" });
    expect((await auth.iniciar()).erro).toBe("falhou");
  });

  it("mostra o erro que o Auth0 manda na URL (ex.: login cancelado)", async () => {
    const cliente = clienteFalso({ autenticado: false });
    const { auth, janela } = montar({ cliente, search: "?error=access_denied&error_description=Cancelado&state=2" });
    expect(await auth.iniciar()).toEqual({ autenticado: false, erro: "Cancelado" });
    expect(janela.history.replaceState).toHaveBeenCalled();
  });
});

describe("ações", () => {
  it("entrar vai para o Universal Login; criar conta abre o cadastro", async () => {
    const { auth, cliente } = montar();
    await auth.iniciar();
    await auth.entrar();
    expect(cliente.loginWithRedirect).toHaveBeenLastCalledWith({});
    await auth.entrar({ criarConta: true });
    expect(cliente.loginWithRedirect).toHaveBeenLastCalledWith({ authorizationParams: { screen_hint: "signup" } });
  });

  it("sair volta para a origem do site", async () => {
    const { auth, cliente } = montar();
    await auth.iniciar();
    await auth.sair();
    expect(cliente.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: "http://localhost:5173" } });
  });

  it("token pede o access token da audiência do gateway", async () => {
    const { auth, cliente } = montar();
    await auth.iniciar();
    expect(await auth.token()).toBe("token-jwt");
    expect(cliente.getTokenSilently).toHaveBeenCalledWith({ authorizationParams: { audience: ENV.VITE_AUTH0_AUDIENCE } });
  });

  it("usuarioAuth0 devolve os dados do ID token", async () => {
    const { auth, cliente } = montar();
    expect(await auth.usuarioAuth0()).toBeNull();   // antes de iniciar
    await auth.iniciar();
    expect(await auth.usuarioAuth0()).toEqual({ name: "Ana", email: "ana@x.com" });
    cliente.getUser.mockResolvedValueOnce(undefined);
    expect(await auth.usuarioAuth0()).toBeNull();
  });

  it("ações antes de iniciar avisam que o login não começou", async () => {
    const { auth } = montar();
    await expect(auth.token()).rejects.toThrow("Login ainda não iniciado");
    await expect(auth.sair()).rejects.toThrow("Login ainda não iniciado");
  });
});
