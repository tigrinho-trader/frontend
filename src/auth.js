// Login com o Auth0 (Universal Login) usando o SDK @auth0/auth0-spa-js.
// A configuração vem das variáveis de build do Vite (VITE_AUTH0_*). Sem elas o jogo
// mostra o aviso "Login não configurado" em vez de quebrar.

// O SDK só é baixado quando o login está configurado (import dinâmico = arquivo separado no build).
async function criarClienteAuth0(opcoes) {
  const { createAuth0Client } = await import('@auth0/auth0-spa-js');
  return createAuth0Client(opcoes);
}

/** Lê a configuração do Auth0 das variáveis do Vite (strings vazias contam como ausentes). */
export function lerConfiguracao(env = {}) {
  const limpar = v => (typeof v === 'string' ? v.trim() : '');
  return {
    domain: limpar(env.VITE_AUTH0_DOMAIN),
    clientId: limpar(env.VITE_AUTH0_CLIENT_ID),
    audience: limpar(env.VITE_AUTH0_AUDIENCE),
  };
}

/**
 * Cria o serviço de login. `criarCliente` e `janela` podem ser trocados nos testes
 * por um cliente falso e um `window` falso.
 */
export function criarAuth({ env = import.meta.env, criarCliente = criarClienteAuth0, janela = globalThis.window } = {}) {
  const config = lerConfiguracao(env);
  let cliente = null;

  const configurado = () => Boolean(config.domain && config.clientId && config.audience);
  const origem = () => janela.location.origin;

  function exigirCliente() {
    if (!configurado()) throw new Error('Login não configurado');
    if (!cliente) throw new Error('Login ainda não iniciado');
    return cliente;
  }

  /** Remove ?code=&state= (ou ?error=) da barra de endereço depois do retorno do Auth0. */
  function limparUrl() {
    const titulo = janela.document?.title ?? '';
    janela.history.replaceState({}, titulo, janela.location.pathname + (janela.location.hash || ''));
  }

  return {
    configurado,

    /** Variáveis que faltam, para o aviso na tela. */
    faltando() {
      return [
        ['VITE_AUTH0_DOMAIN', config.domain],
        ['VITE_AUTH0_CLIENT_ID', config.clientId],
        ['VITE_AUTH0_AUDIENCE', config.audience],
      ].filter(([, v]) => !v).map(([nome]) => nome);
    },

    /**
     * Cria o cliente e, se a página voltou do Auth0 (?code=&state=), conclui o login.
     * Retorna { autenticado, erro } — erro é a mensagem do Auth0 (ex.: login cancelado).
     */
    async iniciar() {
      if (!configurado()) return { autenticado: false, erro: null };
      if (!cliente) {
        cliente = await criarCliente({
          domain: config.domain,
          clientId: config.clientId,
          cacheLocation: 'localstorage',
          useRefreshTokens: true,
          authorizationParams: { redirect_uri: origem(), audience: config.audience },
        });
      }

      let erro = null;
      const params = new URLSearchParams(janela.location.search);
      if (params.has('code') && params.has('state')) {
        try {
          await cliente.handleRedirectCallback();
        } catch (e) {
          erro = e?.error_description || e?.message || 'Não foi possível concluir o login.';
        } finally {
          limparUrl();
        }
      } else if (params.has('error') && params.has('state')) {
        erro = params.get('error_description') || params.get('error');
        limparUrl();
      }

      return { autenticado: await cliente.isAuthenticated(), erro };
    },

    /** Vai para o Universal Login. `criarConta: true` abre direto a tela de cadastro. */
    async entrar({ criarConta = false } = {}) {
      const c = exigirCliente();
      await c.loginWithRedirect(criarConta ? { authorizationParams: { screen_hint: 'signup' } } : {});
    },

    async sair() {
      const c = exigirCliente();
      await c.logout({ logoutParams: { returnTo: origem() } });
    },

    /** Access token (JWT) para o api-gateway; renova sozinho com o refresh token. */
    async token() {
      const c = exigirCliente();
      return c.getTokenSilently({ authorizationParams: { audience: config.audience } });
    },

    /** Dados do ID token (nome, email, foto) — só para exibir enquanto o perfil não chega. */
    async usuarioAuth0() {
      if (!configurado() || !cliente) return null;
      return (await cliente.getUser()) ?? null;
    },
  };
}

// Instância usada pelo jogo
const auth = criarAuth();

export const configurado = () => auth.configurado();
export const faltando = () => auth.faltando();
export const iniciar = () => auth.iniciar();
export const entrar = opcoes => auth.entrar(opcoes);
export const sair = () => auth.sair();
export const token = () => auth.token();
export const usuarioAuth0 = () => auth.usuarioAuth0();
