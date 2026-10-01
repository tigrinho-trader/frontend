// Cliente do api-gateway. O jogador vai no cabecalho X-Usuario-Id ate o login do Auth0 (Etapa 3).
const BASE = "/api";

export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

async function chamar(caminho, { usuario, metodo = "GET", corpo } = {}) {
  const cabecalhos = {};
  if (usuario) cabecalhos["X-Usuario-Id"] = usuario;
  if (corpo) cabecalhos["Content-Type"] = "application/json";

  let resposta;
  try {
    resposta = await fetch(BASE + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(0, "Sem conexao com o servidor");
  }

  const texto = await resposta.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = null;
  }
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, dados?.detail || dados?.title || `Erro ${resposta.status}`);
  }
  return dados;
}

export const api = {
  cotacoes: () => chamar("/cotacoes"),
  regras: () => chamar("/ordens/regras"),
  barreira: () => chamar("/ordens/barreira"),
  carteira: (usuario) => chamar("/carteira", { usuario }),
  extrato: (usuario) => chamar("/carteira/extrato", { usuario }),
  depositar: (usuario, valor) => chamar("/carteira/depositos", { usuario, metodo: "POST", corpo: { valor } }),
  apostar: (usuario, pedido) => chamar("/ordens", { usuario, metodo: "POST", corpo: pedido }),
  ordem: (usuario, id) => chamar(`/ordens/${id}`, { usuario }),
  ordens: (usuario) => chamar("/ordens", { usuario }),
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a carteira registrar o resultado da rodada (chega pelo RabbitMQ, entao e assincrono). */
export async function esperarCredito(usuario, ordemId, { tentativas = 15, intervaloMs = 700 } = {}) {
  for (let i = 0; i < tentativas; i++) {
    const extrato = await api.extrato(usuario);
    if (extrato.some((t) => t.referencia === ordemId)) return true;
    await esperar(intervaloMs);
  }
  return false;
}
