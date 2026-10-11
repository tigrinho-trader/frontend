import { describe, expect, it, vi } from "vitest";
import * as modulo from "./auth.js";
import { ErroLogin, PADRAO, criarAuth, criarGerenciadorOidc, ehFalhaDeRede, lerConfiguracao } from "./auth.js";

const KEYCLOAK = {};   // sem variáveis = Keycloak local
const AUTH0 = {
  VITE_OIDC_AUTHORITY: "https://tigrinho-trader.us.auth0.com",
  VITE_OIDC_CLIENT_ID: "abc123",
  VITE_OIDC_AUDIENCE: "https://api.tigrinho-trader",
  VITE_OIDC_PROVEDOR: "auth0",
};

const falhaDeRede = () => new TypeError("Failed to fetch");

/** Usuário do oidc-client-ts (só o que o auth.js lê). */
function usuario({ token = "token-jwt", expirado = false, perfil = { name: "Ana", email: "ana@x.com" } } = {}) {
  return { access_token: token, expired: expirado, profile: perfil };
}

/** UserManager falso. `guardado` = usuário no localStorage. */
function gerenciadorFalso({ guardado = usuario(), falhaCallback = null, falhaMetadados = null } = {}) {
  const g = {
    guardado,
    signinRedirectCallback: vi.fn(async () => {
      if (falhaCallback) throw falhaCallback;
      g.guardado = usuario();
      return g.guardado;
    }),
    getUser: vi.fn(async () => g.guardado),
    signinSilent: vi.fn(async () => {
      g.guardado = usuario({ token: "token-renovado" });
      return g.guardado;
    }),
    signinRedirect: vi.fn(async () => {}),
    signoutRedirect: vi.fn(async () => {}),
    removeUser: vi.fn(async () => { g.guardado = null; }),
    metadataService: {
      getMetadata: vi.fn(async () => {
        if (falhaMetadados) throw falhaMetadados;
        return { issuer: PADRAO.authority };
      }),
    },
  };
  return g;
}

function janelaFalsa(search = "") {
  return {
    location: {
      origin: "http://localhost:5173", pathname: "/", search, hash: "",
      href: `http://localhost:5173/${search}`, reload: vi.fn(),
    },
    history: { replaceState: vi.fn() },
    document: { title: "Flecha Certeira" },
  };
}

function montar({ env = KEYCLOAK, gerenciador = gerenciadorFalso(), search = "" } = {}) {
  const janela = janelaFalsa(search);
  const criarCliente = vi.fn(async () => gerenciador);
  const auth = criarAuth({ env, criarCliente, janela });
  return { auth, g: gerenciador, criarCliente, janela };
}

async function iniciado(opcoes) {
  const m = montar(opcoes);
  await m.auth.iniciar();
  return m;
}

describe("configuração", () => {
  it("sem variáveis usa o Keycloak local", () => {
    expect(lerConfiguracao({})).toEqual({
      authority: "http://localhost:8180/realms/tigrinho",
      clientId: "flecha-certeira",
      audience: "",
      provedor: "keycloak",
    });
    expect(lerConfiguracao()).toEqual(lerConfiguracao({}));
    const { auth } = montar();
    expect(auth.configurado()).toBe(true);
    expect(auth.faltando()).toEqual([]);
    expect(auth.provedor()).toEqual({ nome: "keycloak", endereco: "http://localhost:8180" });
  });

  it("lê as quatro variáveis do Vite e ignora espaços", () => {
    expect(lerConfiguracao({ ...AUTH0, VITE_OIDC_CLIENT_ID: "  abc  ", VITE_OIDC_PROVEDOR: " Auth0 " })).toEqual({
      authority: AUTH0.VITE_OIDC_AUTHORITY,
      clientId: "abc",
      audience: AUTH0.VITE_OIDC_AUDIENCE,
      provedor: "auth0",
    });
  });

  it("reconhece o Auth0 pelo endereço quando VITE_OIDC_PROVEDOR não foi definido", () => {
    expect(lerConfiguracao({ VITE_OIDC_AUTHORITY: "https://x.us.auth0.com/" }).provedor).toBe("auth0");
    expect(lerConfiguracao({ VITE_OIDC_AUTHORITY: "https://x.us.auth0.com", VITE_OIDC_PROVEDOR: "" }).provedor).toBe("auth0");
    expect(lerConfiguracao({ VITE_OIDC_AUTHORITY: "https://sso.empresa.com/realms/x" }).provedor).toBe("keycloak");
  });

  it("só fica não configurado se authority ou client id forem definidos vazios", () => {
    for (const chave of ["VITE_OIDC_AUTHORITY", "VITE_OIDC_CLIENT_ID"]) {
      const { auth } = montar({ env: { [chave]: "  " } });
      expect(auth.configurado()).toBe(false);
      expect(auth.faltando()).toEqual([chave]);
    }
    expect(montar({ env: { VITE_OIDC_AUDIENCE: "" } }).auth.configurado()).toBe(true);
  });

  it("endereço do provedor inválido aparece como veio", () => {
    expect(montar({ env: { VITE_OIDC_AUTHORITY: "keycloak" } }).auth.provedor().endereco).toBe("keycloak");
  });

  it("sem configuração: iniciar não cria cliente e as ações falham com mensagem clara", async () => {
    const { auth, criarCliente } = montar({ env: { VITE_OIDC_AUTHORITY: "", VITE_OIDC_CLIENT_ID: "" } });
    expect(await auth.iniciar()).toEqual({ autenticado: false, erro: null });
    expect(criarCliente).not.toHaveBeenCalled();
    await expect(auth.entrar()).rejects.toThrow("Login não configurado");
    await expect(auth.token()).rejects.toThrow("Login não configurado");
    await expect(auth.sair()).rejects.toThrow("Login não configurado");
    expect(await auth.usuarioOidc()).toBeNull();
  });

  it("a instância padrão do módulo expõe as funções", () => {
    // (não fixa valores: um .env local pode trocar o provedor)
    expect(typeof modulo.configurado()).toBe("boolean");
    expect(Array.isArray(modulo.faltando())).toBe(true);
    expect(typeof modulo.provedor().nome).toBe("string");
    for (const f of ["iniciar", "entrar", "sair", "token", "usuarioOidc"]) expect(typeof modulo[f]).toBe("function");
  });
});

describe("criarGerenciadorOidc", () => {
  it("cria um UserManager de verdade com o usuário no localStorage", async () => {
    const armazenamento = () => {
      const dados = new Map();
      return {
        getItem: k => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v), removeItem: k => dados.delete(k),
        key: i => [...dados.keys()][i] ?? null, get length() { return dados.size; },
      };
    };
    const janela = { localStorage: armazenamento(), sessionStorage: armazenamento() };
    const um = await criarGerenciadorOidc({
      authority: PADRAO.authority, client_id: PADRAO.clientId,
      redirect_uri: "http://localhost:5173/", automaticSilentRenew: false,
    }, janela);
    expect(um.constructor.name).toBe("UserManager");
    expect(um.settings.authority).toBe(PADRAO.authority);
    expect(um.settings.client_id).toBe("flecha-certeira");
    expect(um.settings.userStore._store).toBe(janela.localStorage);
    expect(await um.getUser()).toBeNull();
  });
});

describe("ehFalhaDeRede", () => {
  it("reconhece as mensagens de rede dos navegadores e do Node", () => {
    for (const m of ["Failed to fetch", "fetch failed", "NetworkError when attempting to fetch resource.", "Load failed"]) {
      expect(ehFalhaDeRede(new TypeError(m))).toBe(true);
    }
    expect(ehFalhaDeRede(Object.assign(new Error("Network timed out"), { name: "ErrorTimeout" }))).toBe(true);
    expect(ehFalhaDeRede(new Error("invalid_grant"))).toBe(false);
    expect(ehFalhaDeRede({})).toBe(false);
    expect(ehFalhaDeRede(null)).toBe(false);
  });
});

describe("iniciar", () => {
  it("cria o UserManager com code + PKCE, redirect na origem, escopos e renovação automática", async () => {
    const { auth, criarCliente, janela } = montar();
    expect(await auth.iniciar()).toEqual({ autenticado: true, erro: null });
    expect(criarCliente).toHaveBeenCalledWith({
      authority: "http://localhost:8180/realms/tigrinho",
      client_id: "flecha-certeira",
      redirect_uri: "http://localhost:5173/",
      post_logout_redirect_uri: "http://localhost:5173/",
      response_type: "code",
      scope: "openid profile email",
      automaticSilentRenew: true,
      requestTimeoutInSeconds: 10,
      extraQueryParams: {},
    }, janela);
  });

  it("Auth0: manda audience e pede offline_access (refresh token)", async () => {
    const { criarCliente } = await iniciado({ env: AUTH0 });
    const opcoes = criarCliente.mock.calls[0][0];
    expect(opcoes.authority).toBe(AUTH0.VITE_OIDC_AUTHORITY);
    expect(opcoes.client_id).toBe("abc123");
    expect(opcoes.extraQueryParams).toEqual({ audience: "https://api.tigrinho-trader" });
    expect(opcoes.scope).toBe("openid profile email offline_access");
  });

  it("cria o cliente uma vez só", async () => {
    const { auth, criarCliente } = montar();
    await auth.iniciar();
    await auth.iniciar();
    expect(criarCliente).toHaveBeenCalledTimes(1);
  });

  it("conclui o retorno do provedor (?code=&state=) e limpa a URL", async () => {
    const { auth, g, janela } = montar({ gerenciador: gerenciadorFalso({ guardado: null }), search: "?code=xyz&state=abc&session_state=1" });
    expect(await auth.iniciar()).toEqual({ autenticado: true, erro: null });
    expect(g.signinRedirectCallback).toHaveBeenCalledWith("http://localhost:5173/?code=xyz&state=abc&session_state=1");
    expect(janela.history.replaceState).toHaveBeenCalledWith({}, "Flecha Certeira", "/");
  });

  it("mantém o #hash ao limpar a URL", async () => {
    const janela = janelaFalsa("?code=1&state=2");
    janela.location.hash = "#jogo";
    const auth = criarAuth({ env: {}, criarCliente: async () => gerenciadorFalso(), janela });
    await auth.iniciar();
    expect(janela.history.replaceState).toHaveBeenCalledWith({}, "Flecha Certeira", "/#jogo");
  });

  it("não chama o callback sem code e state", async () => {
    const { auth, g, janela } = montar({ search: "?code=xyz" });
    await auth.iniciar();
    expect(g.signinRedirectCallback).not.toHaveBeenCalled();
    expect(janela.history.replaceState).not.toHaveBeenCalled();
  });

  it("devolve o erro do callback e limpa a URL mesmo assim", async () => {
    const falha = Object.assign(new Error("No matching state found in storage"), { error_description: "Estado inválido" });
    const gerenciador = gerenciadorFalso({ guardado: null, falhaCallback: falha });
    const { auth, janela } = montar({ gerenciador, search: "?code=1&state=2" });
    expect(await auth.iniciar()).toEqual({ autenticado: false, erro: "Estado inválido" });
    expect(janela.history.replaceState).toHaveBeenCalled();
  });

  it("usa a mensagem do erro quando não há error_description, ou um texto padrão", async () => {
    let m = montar({ gerenciador: gerenciadorFalso({ guardado: null, falhaCallback: new Error("falhou") }), search: "?code=1&state=2" });
    expect((await m.auth.iniciar()).erro).toBe("falhou");
    m = montar({ gerenciador: gerenciadorFalso({ guardado: null, falhaCallback: {} }), search: "?code=1&state=2" });
    expect((await m.auth.iniciar()).erro).toBe("Não foi possível concluir o login.");
  });

  it("servidor fora do ar no callback: lança aviso claro e limpa a URL", async () => {
    const gerenciador = gerenciadorFalso({ guardado: null, falhaCallback: falhaDeRede() });
    const { auth, janela } = montar({ gerenciador, search: "?code=1&state=2" });
    const erro = await auth.iniciar().catch(e => e);
    expect(erro).toBeInstanceOf(ErroLogin);
    expect(erro.servidorFora).toBe(true);
    expect(erro.message).toBe(
      "Não foi possível falar com o servidor de login (http://localhost:8180). Ele está no ar? Suba com docker compose.",
    );
    expect(janela.history.replaceState).toHaveBeenCalled();
  });

  it("mostra o erro OIDC que vem na URL (ex.: login cancelado) e limpa a URL", async () => {
    const { auth, g, janela } = montar({
      gerenciador: gerenciadorFalso({ guardado: null }),
      search: "?error=access_denied&error_description=Cancelado&state=2",
    });
    expect(await auth.iniciar()).toEqual({ autenticado: false, erro: "Cancelado" });
    expect(g.signinRedirectCallback).not.toHaveBeenCalled();
    expect(janela.history.replaceState).toHaveBeenCalled();
  });

  it("sem error_description usa o código do erro", async () => {
    const { auth } = montar({ gerenciador: gerenciadorFalso({ guardado: null }), search: "?error=login_required" });
    expect((await auth.iniciar()).erro).toBe("login_required");
  });

  it("sem sessão: confere se o servidor de login responde (descoberta)", async () => {
    const { auth, g } = montar({ gerenciador: gerenciadorFalso({ guardado: null }) });
    expect(await auth.iniciar()).toEqual({ autenticado: false, erro: null });
    expect(g.metadataService.getMetadata).toHaveBeenCalled();
  });

  it("com sessão válida não consulta a descoberta", async () => {
    const { g } = await iniciado();
    expect(g.metadataService.getMetadata).not.toHaveBeenCalled();
  });

  it("descoberta falhando por rede (Keycloak parado) vira aviso claro", async () => {
    const gerenciador = gerenciadorFalso({ guardado: null, falhaMetadados: new TypeError("fetch failed") });
    const erro = await montar({ gerenciador }).auth.iniciar().catch(e => e);
    expect(erro.servidorFora).toBe(true);
    expect(erro.message).toContain("Não foi possível falar com o servidor de login (http://localhost:8180)");
    expect(erro.causa).toBeInstanceOf(TypeError);
  });

  it("descoberta com resposta de erro (ex.: reino errado) pede para conferir VITE_OIDC_AUTHORITY", async () => {
    const gerenciador = gerenciadorFalso({ guardado: null, falhaMetadados: new Error("Not Found (404)") });
    const erro = await montar({ gerenciador }).auth.iniciar().catch(e => e);
    expect(erro).toBeInstanceOf(ErroLogin);
    expect(erro.servidorFora).toBe(false);
    expect(erro.message).toBe(
      "O servidor de login (http://localhost:8180) respondeu com erro: Not Found (404). Confira VITE_OIDC_AUTHORITY.",
    );
  });

  it("gerenciador sem metadataService não quebra", async () => {
    const gerenciador = gerenciadorFalso({ guardado: null });
    delete gerenciador.metadataService;
    expect(await montar({ gerenciador }).auth.iniciar()).toEqual({ autenticado: false, erro: null });
  });

  it("sessão guardada vencida: renova em silêncio", async () => {
    const { auth, g } = montar({ gerenciador: gerenciadorFalso({ guardado: usuario({ expirado: true }) }) });
    expect(await auth.iniciar()).toEqual({ autenticado: true, erro: null });
    expect(g.signinSilent).toHaveBeenCalledTimes(1);
  });

  it("sessão vencida que não renova (refresh token recusado): apaga e fica sem login", async () => {
    const g = gerenciadorFalso({ guardado: usuario({ expirado: true }) });
    g.signinSilent.mockRejectedValueOnce(new Error("invalid_grant"));
    const { auth } = montar({ gerenciador: g });
    expect(await auth.iniciar()).toEqual({ autenticado: false, erro: null });
    expect(g.removeUser).toHaveBeenCalled();
  });

  it("sessão vencida com o servidor fora do ar: aviso claro, sem apagar a sessão", async () => {
    const g = gerenciadorFalso({ guardado: usuario({ expirado: true }) });
    g.signinSilent.mockRejectedValueOnce(falhaDeRede());
    const erro = await montar({ gerenciador: g }).auth.iniciar().catch(e => e);
    expect(erro.servidorFora).toBe(true);
    expect(g.removeUser).not.toHaveBeenCalled();
  });
});

describe("entrar", () => {
  it("Keycloak: entrar vai para o login; criar conta vai para o endpoint /registrations", async () => {
    const { auth, g, criarCliente } = await iniciado();
    await auth.entrar();
    expect(g.signinRedirect).toHaveBeenLastCalledWith({});
    expect(criarCliente).toHaveBeenCalledTimes(1);

    await auth.entrar({ criarConta: true });
    expect(criarCliente).toHaveBeenCalledTimes(2);
    const [config] = criarCliente.mock.calls[1];
    expect(config.metadataSeed).toEqual({ authorization_endpoint: "http://localhost:8180/realms/tigrinho/protocol/openid-connect/registrations" });
    expect(config.client_id).toBe("flecha-certeira");
    expect(config.redirect_uri).toBe(criarCliente.mock.calls[0][0].redirect_uri);
    expect(g.signinRedirect).toHaveBeenLastCalledWith({});
  });

  it("Keycloak com barra no fim da authority não duplica a barra no /registrations", async () => {
    const { auth, criarCliente } = await iniciado({ env: { VITE_OIDC_AUTHORITY: "http://localhost:8180/realms/tigrinho/" } });
    await auth.entrar({ criarConta: true });
    expect(criarCliente.mock.calls[1][0].metadataSeed.authorization_endpoint).toBe("http://localhost:8180/realms/tigrinho/protocol/openid-connect/registrations");
  });

  it("Auth0: criar conta usa screen_hint=signup e sempre manda a audience", async () => {
    const { auth, g, criarCliente } = await iniciado({ env: AUTH0 });
    await auth.entrar();
    expect(g.signinRedirect).toHaveBeenLastCalledWith({ extraQueryParams: { audience: "https://api.tigrinho-trader" } });
    await auth.entrar({ criarConta: true });
    expect(g.signinRedirect).toHaveBeenLastCalledWith({
      extraQueryParams: { audience: "https://api.tigrinho-trader", screen_hint: "signup" },
    });
    expect(criarCliente).toHaveBeenCalledTimes(1);
  });

  it("Keycloak com audience configurada também manda a audience", async () => {
    const { auth, g, criarCliente } = await iniciado({ env: { VITE_OIDC_AUDIENCE: "tigrinho-api" } });
    await auth.entrar({ criarConta: true });
    expect(criarCliente.mock.calls[1][0].metadataSeed.authorization_endpoint).toMatch(/\/registrations$/);
    expect(g.signinRedirect).toHaveBeenLastCalledWith({ extraQueryParams: { audience: "tigrinho-api" } });
  });

  it("servidor de login fora do ar vira aviso claro", async () => {
    const { auth, g } = await iniciado();
    g.signinRedirect.mockRejectedValueOnce(falhaDeRede());
    await expect(auth.entrar()).rejects.toMatchObject({ name: "ErroLogin", servidorFora: true });
  });

  it("antes de iniciar avisa que o login não começou", async () => {
    await expect(montar().auth.entrar()).rejects.toThrow("Login ainda não iniciado");
  });
});

describe("sair", () => {
  it("sai no provedor e volta para a origem", async () => {
    const { auth, g, janela } = await iniciado();
    await auth.sair();
    expect(g.signoutRedirect).toHaveBeenCalledTimes(1);
    expect(g.removeUser).not.toHaveBeenCalled();
    expect(janela.location.reload).not.toHaveBeenCalled();
  });

  it("provedor sem end_session_endpoint: apaga o usuário local e recarrega", async () => {
    const { auth, g, janela } = await iniciado();
    g.signoutRedirect.mockRejectedValueOnce(new Error("No end session endpoint"));
    await auth.sair();
    expect(g.removeUser).toHaveBeenCalled();
    expect(janela.location.reload).toHaveBeenCalled();
  });

  it("antes de iniciar avisa que o login não começou", async () => {
    await expect(montar().auth.sair()).rejects.toThrow("Login ainda não iniciado");
  });
});

describe("token", () => {
  it("devolve o access token guardado", async () => {
    const { auth, g } = await iniciado();
    expect(await auth.token()).toBe("token-jwt");
    expect(g.signinSilent).not.toHaveBeenCalled();
  });

  it("token vencido: renova com signinSilent", async () => {
    const { auth, g } = await iniciado();
    g.guardado = usuario({ expirado: true });
    expect(await auth.token()).toBe("token-renovado");
    expect(g.signinSilent).toHaveBeenCalledTimes(1);
  });

  it("renovação recusada: lança erro de sessão", async () => {
    const { auth, g } = await iniciado();
    g.guardado = usuario({ expirado: true });
    g.signinSilent.mockRejectedValueOnce(new Error("invalid_grant"));
    await expect(auth.token()).rejects.toThrow("Sem sessão de login");
  });

  it("renovação devolvendo nada: lança erro de sessão", async () => {
    const { auth, g } = await iniciado();
    g.guardado = usuario({ expirado: true });
    g.signinSilent.mockResolvedValueOnce(null);
    await expect(auth.token()).rejects.toThrow("Sem sessão de login");
  });

  it("sem sessão: lança erro", async () => {
    const { auth } = await iniciado({ gerenciador: gerenciadorFalso({ guardado: null }) });
    await expect(auth.token()).rejects.toBeInstanceOf(ErroLogin);
  });

  it("antes de iniciar avisa que o login não começou", async () => {
    await expect(montar().auth.token()).rejects.toThrow("Login ainda não iniciado");
  });
});

describe("usuarioOidc", () => {
  it("devolve os dados do ID token", async () => {
    const { auth, g } = montar();
    expect(await auth.usuarioOidc()).toBeNull();   // antes de iniciar
    await auth.iniciar();
    expect(await auth.usuarioOidc()).toEqual({ name: "Ana", email: "ana@x.com" });
    g.guardado = null;
    expect(await auth.usuarioOidc()).toBeNull();
  });
});
