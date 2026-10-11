// Login por OpenID Connect (Authorization Code + PKCE) com a biblioteca oidc-client-ts.
// Por padrão o provedor é o Keycloak local do docker-compose (http://localhost:8180, reino "tigrinho");
// o Auth0 (ou outro provedor OIDC) funciona só trocando as variáveis de build do Vite (VITE_OIDC_*).

/** Valores padrão: Keycloak local, sem precisar de nenhuma variável. */
export const PADRAO = {
  authority: 'http://localhost:8180/realms/tigrinho',
  clientId: 'flecha-certeira',
  audience: '',
  provedor: 'keycloak',
};

// A biblioteca só é baixada quando o login começa (import dinâmico = arquivo separado no build).
export async function criarGerenciadorOidc(configuracoes, janela = globalThis.window) {
  const { UserManager, WebStorageStateStore } = await import('oidc-client-ts');
  return new UserManager({
    ...configuracoes,
    userStore: new WebStorageStateStore({ store: janela.localStorage }),
    stateStore: new WebStorageStateStore({ store: janela.sessionStorage }),
  });
}

/**
 * Lê a configuração do login das variáveis do Vite. Variável ausente usa o padrão (Keycloak local);
 * variável definida como texto vazio fica vazia (e o login aparece como "não configurado").
 */
export function lerConfiguracao(env = {}) {
  const ler = (nome, padrao) => (typeof env[nome] === 'string' ? env[nome].trim() : padrao);
  const authority = ler('VITE_OIDC_AUTHORITY', PADRAO.authority);
  const provedorPadrao = /\.auth0\.com(\/|$)/i.test(authority) ? 'auth0' : PADRAO.provedor;
  return {
    authority,
    clientId: ler('VITE_OIDC_CLIENT_ID', PADRAO.clientId),
    audience: ler('VITE_OIDC_AUDIENCE', PADRAO.audience),
    provedor: (ler('VITE_OIDC_PROVEDOR', '') || provedorPadrao).toLowerCase(),
  };
}

/** Falha de rede (servidor de login fora do ar, porta errada, tempo esgotado). */
export function ehFalhaDeRede(erro) {
  if (!erro) return false;
  if (erro.name === 'ErrorTimeout') return true;
  return /failed to fetch|fetch failed|networkerror|network error|network timed out|load failed/i.test(erro.message || '');
}

/** Erro com texto pronto para o menu; `servidorFora` = o provedor de login não respondeu. */
export class ErroLogin extends Error {
  constructor(mensagem, { servidorFora = false, causa = null } = {}) {
    super(mensagem);
    this.name = 'ErroLogin';
    this.servidorFora = servidorFora;
    this.causa = causa;
  }
}

/**
 * Cria o serviço de login. `criarCliente` e `janela` podem ser trocados nos testes
 * por um UserManager falso e um `window` falso.
 */
export function criarAuth({ env = import.meta.env, criarCliente = criarGerenciadorOidc, janela = globalThis.window } = {}) {
  const config = lerConfiguracao(env);
  let cliente = null;
  let configCliente = null;

  const configurado = () => Boolean(config.authority && config.clientId);
  const origem = () => `${janela.location.origin}/`;
  const ehAuth0 = () => config.provedor === 'auth0';
  /** audience só vai para o provedor quando foi configurada (Auth0 precisa; Keycloak não). */
  const parametrosExtras = () => (config.audience ? { audience: config.audience } : {});

  function enderecoServidor() {
    try {
      return new URL(config.authority).origin;
    } catch {
      return config.authority;
    }
  }

  /**
   * Troca erros de rede por uma mensagem clara. Com `descoberta`, qualquer outra falha também vira um
   * aviso sobre o servidor de login (ex.: reino inexistente → 404 no .well-known/openid-configuration).
   */
  function traduzir(erro, { descoberta = false } = {}) {
    if (erro instanceof ErroLogin) return erro;
    if (ehFalhaDeRede(erro)) {
      return new ErroLogin(
        `Não foi possível falar com o servidor de login (${enderecoServidor()}). Ele está no ar? Suba com docker compose.`,
        { servidorFora: true, causa: erro },
      );
    }
    if (!descoberta) return erro;
    return new ErroLogin(
      `O servidor de login (${enderecoServidor()}) respondeu com erro: ${erro?.message || erro}. Confira VITE_OIDC_AUTHORITY.`,
      { causa: erro },
    );
  }

  function exigirCliente() {
    if (!configurado()) throw new ErroLogin('Login não configurado');
    if (!cliente) throw new ErroLogin('Login ainda não iniciado');
    return cliente;
  }

  /** Remove ?code=&state= (ou ?error=) da barra de endereço depois do retorno do provedor. */
  function limparUrl() {
    const titulo = janela.document?.title ?? '';
    janela.history.replaceState({}, titulo, janela.location.pathname + (janela.location.hash || ''));
  }

  /** Usuário guardado; se o access token venceu, tenta renovar (refresh token). */
  async function usuarioValido() {
    const usuario = await cliente.getUser();
    if (!usuario || !usuario.expired) return usuario;
    try {
      return await cliente.signinSilent();
    } catch (e) {
      if (ehFalhaDeRede(e)) throw traduzir(e);
      await cliente.removeUser();
      return null;
    }
  }

  return {
    configurado,

    /** Variáveis que estão vazias, para o aviso na tela. */
    faltando() {
      return [
        ['VITE_OIDC_AUTHORITY', config.authority],
        ['VITE_OIDC_CLIENT_ID', config.clientId],
      ].filter(([, v]) => !v).map(([nome]) => nome);
    },

    /** Provedor em uso ('keycloak', 'auth0', ...) e o endereço dele, para mensagens. */
    provedor: () => ({ nome: config.provedor, endereco: enderecoServidor() }),

    /**
     * Cria o cliente e, se a página voltou do provedor (?code=&state=), conclui o login.
     * Retorna { autenticado, erro } — erro é a mensagem do provedor (ex.: login cancelado).
     * Lança ErroLogin com `servidorFora` se o servidor de login não responder.
     */
    async iniciar() {
      if (!configurado()) return { autenticado: false, erro: null };
      if (!cliente) {
        configCliente = {
          authority: config.authority,
          client_id: config.clientId,
          redirect_uri: origem(),
          post_logout_redirect_uri: origem(),
          response_type: 'code',
          // Auth0 só entrega refresh token com offline_access; o Keycloak entrega sempre.
          scope: ehAuth0() ? 'openid profile email offline_access' : 'openid profile email',
          automaticSilentRenew: true,
          requestTimeoutInSeconds: 10,
          extraQueryParams: parametrosExtras(),
        };
        cliente = await criarCliente(configCliente, janela);
      }

      let erro = null;
      const params = new URLSearchParams(janela.location.search);
      if (params.has('code') && params.has('state')) {
        try {
          await cliente.signinRedirectCallback(janela.location.href);
        } catch (e) {
          if (ehFalhaDeRede(e)) throw traduzir(e);
          erro = e?.error_description || e?.message || 'Não foi possível concluir o login.';
        } finally {
          limparUrl();
        }
      } else if (params.has('error')) {
        erro = params.get('error_description') || params.get('error');
        limparUrl();
      }

      const usuario = await usuarioValido();
      if (usuario) return { autenticado: true, erro };

      // Sem sessão: confere já se o servidor de login responde, para avisar antes do clique em "Entrar".
      try {
        await cliente.metadataService?.getMetadata();
      } catch (e) {
        throw traduzir(e, { descoberta: true });
      }
      return { autenticado: false, erro };
    },

    /**
     * Vai para a tela de login do provedor. `criarConta: true` abre direto o cadastro: no Auth0 com
     * screen_hint=signup; no Keycloak pelo endpoint /registrations (o prompt=create cai no login), usando
     * um cliente só para isso. O retorno (?code=&state=) é concluído pelo cliente principal, que lê o mesmo
     * estado guardado.
     */
    async entrar({ criarConta = false } = {}) {
      let c = exigirCliente();
      const extras = parametrosExtras();
      const args = {};
      try {
        if (criarConta && ehAuth0()) {
          extras.screen_hint = 'signup';
        } else if (criarConta) {
          c = await criarCliente({
            ...configCliente,
            metadataSeed: { authorization_endpoint: `${config.authority.replace(/\/+$/, '')}/protocol/openid-connect/registrations` },
          }, janela);
        }
        if (Object.keys(extras).length) args.extraQueryParams = extras;
        await c.signinRedirect(args);
      } catch (e) {
        throw traduzir(e, { descoberta: true });
      }
    },

    /** Sai no provedor; se ele não tiver logout (end_session_endpoint) ou não responder, sai só aqui. */
    async sair() {
      const c = exigirCliente();
      try {
        await c.signoutRedirect();
      } catch {
        await c.removeUser();
        janela.location.reload();
      }
    },

    /** Access token (JWT) para o api-gateway; renova sozinho quando vence. Sem sessão, lança erro. */
    async token() {
      exigirCliente();
      const usuario = await usuarioValido();
      if (!usuario?.access_token) throw new ErroLogin('Sem sessão de login');
      return usuario.access_token;
    },

    /** Dados do ID token (nome, email, foto) — só para exibir enquanto o perfil não chega. */
    async usuarioOidc() {
      if (!configurado() || !cliente) return null;
      return (await cliente.getUser())?.profile ?? null;
    },
  };
}

// Instância usada pelo jogo
const auth = criarAuth();

export const configurado = () => auth.configurado();
export const faltando = () => auth.faltando();
export const provedor = () => auth.provedor();
export const iniciar = () => auth.iniciar();
export const entrar = opcoes => auth.entrar(opcoes);
export const sair = () => auth.sair();
export const token = () => auth.token();
export const usuarioOidc = () => auth.usuarioOidc();
