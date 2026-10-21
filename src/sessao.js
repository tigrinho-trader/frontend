// Controle de uma sessão do Flecha Certeira no servidor (trading-service).
// Os tiros vão um de cada vez, na ordem em que as flechas terminaram, com pelo menos
// INTERVALO_MINIMO_MS entre eles (o servidor recusa com 429 abaixo de 150 ms).
// O servidor manda no dinheiro: ganhos e flechas de cada resposta substituem os valores
// locais; entre uma resposta e outra o HUD usa as estimativas dos tiros ainda na fila.
// Flechas de mercado vêm em lotes (tipo + valor de cada flecha): `sessao.mercado` = [{ flecha, valor, quantidade }].
// Sem DOM: a API e o relógio são injetados, para testar com objetos falsos.
import { lotesDaSessao } from './regras.js';

export const INTERVALO_MINIMO_MS = 160;
const TENTATIVAS_429 = 2;

const numero = v => Number(v) || 0;
const esperarPadrao = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {object} opcoes
 * @param {object} opcoes.api            funções abrirSessao, registrarTiro, comprarFlechas, encerrarSessao,
 *                                       registrarOperacaoEstudo, sessaoAtual
 * @param {(sessao: object, ganhosTiro?: number) => void} [opcoes.aoAtualizar] chamada a cada resposta do servidor
 * @param {(erro: Error, contexto: object) => void} [opcoes.aoErro] tiro recusado ou falha de rede
 */
export function criarControladorSessao({
  api,
  intervaloMinimo = INTERVALO_MINIMO_MS,
  agora = () => Date.now(),
  esperar = esperarPadrao,
  aoAtualizar = () => {},
  aoErro = () => {},
} = {}) {
  let sessao = null;
  let fila = Promise.resolve();
  let ultimoTiro = null;
  const pendentes = [];   // tiros na fila: { flecha, estimativa }

  /** Põe a tarefa no fim da fila; uma falha não trava as próximas. */
  function enfileirar(tarefa) {
    const resultado = fila.then(tarefa);
    fila = resultado.catch(() => {});
    return resultado;
  }

  function aplicar(nova, ganhosTiro) {
    sessao = nova;
    aoAtualizar(nova, ganhosTiro);
  }

  function exigirSessao() {
    if (!sessao) throw new Error('Nenhuma sessão aberta');
    return sessao;
  }

  async function aguardarRitmo() {
    if (ultimoTiro === null) return;
    const falta = ultimoTiro + intervaloMinimo - agora();
    if (falta > 0) await esperar(falta);
  }

  async function enviarTiro(flecha, acertos) {
    for (let tentativa = 0; ; tentativa++) {
      await aguardarRitmo();
      ultimoTiro = agora();
      try {
        return await api.registrarTiro(exigirSessao().id, flecha, acertos);
      } catch (erro) {
        // 429: chegou cedo demais (relógio do servidor); 409 "ao mesmo tempo": o servidor pagou uma aposta de
        // mercado nesta sessão no mesmo instante. Nos dois casos, espera e tenta de novo
        const repetir = erro?.status === 429 || (erro?.status === 409 && /ao mesmo tempo/i.test(erro?.mensagem || ''));
        if (repetir && tentativa < TENTATIVAS_429) continue;
        throw erro;
      }
    }
  }

  return {
    /**
     * Abre a sessão no servidor (POST /sessoes): `flechas` = comuns ({ wood: n }), `mercado` = lotes
     * [{ flecha, valor, quantidade }]. Lança o ErroApi em caso de 409/422.
     */
    async abrir(campo, flechas, mercado = []) {
      const nova = await api.abrirSessao(campo, flechas, mercado);
      ultimoTiro = null;
      aplicar(nova);
      return nova;
    },

    /** Continua uma sessão que já existe (ex.: veio de GET /sessoes/atual). */
    retomar(existente) {
      aplicar(existente);
    },

    /**
     * Informa uma flecha que terminou o voo e os pássaros que ela acertou (na ordem).
     * `estimativa` = moedas calculadas no navegador, usadas no HUD até a resposta chegar.
     * Nunca rejeita: em caso de erro chama aoErro e resolve com null.
     */
    registrarTiro(flecha, acertos = [], estimativa = 0) {
      const item = { flecha, estimativa: numero(estimativa) };
      pendentes.push(item);
      return enfileirar(async () => {
        try {
          const resposta = await enviarTiro(flecha, [...acertos]);
          pendentes.splice(pendentes.indexOf(item), 1);
          aplicar(resposta.sessao, numero(resposta.ganhosTiro));
          return resposta;
        } catch (erro) {
          pendentes.splice(pendentes.indexOf(item), 1);
          aoErro(erro, { tipo: 'tiro', flecha, acertos: [...acertos] });
          // Sem a resposta, o HUD volta aos números confirmados do servidor
          if (sessao) aoAtualizar(sessao);
          return null;
        }
      });
    },

    /**
     * Flecha de mercado: o servidor registra a operação e já desconta a flecha do lote `dados.valor`. `aoConsumir`
     * roda antes de aplicar a sessão nova (o HUD para de contar a flecha como "no ar"). Devolve a operação; lança o
     * ErroApi.
     */
    registrarMercado(dados, aoConsumir = () => {}) {
      return enfileirar(async () => {
        const op = await api.registrarOperacaoEstudo({ ...dados, sessaoId: exigirSessao().id });
        aoConsumir(op);
        if (op?.sessao) aplicar(op.sessao);
        return op;
      });
    },

    /** Relê a sessão no servidor (ex.: depois que uma flecha de mercado foi paga). Devolve a sessão ou null. */
    atualizar() {
      return enfileirar(async () => {
        const atual = await api.sessaoAtual();
        if (atual && sessao && atual.id === sessao.id) aplicar(atual);
        return atual || null;
      });
    },

    /** Compra mais flechas (depois dos tiros que estão na fila); `valor` nas de mercado. Lança o ErroApi. */
    comprar(flecha, quantidade, valor) {
      return enfileirar(async () => {
        const nova = valor === undefined || valor === null
          ? await api.comprarFlechas(exigirSessao().id, flecha, quantidade)
          : await api.comprarFlechas(exigirSessao().id, flecha, quantidade, valor);
        aplicar(nova);
        return nova;
      });
    },

    /** Espera os tiros da fila e encerra a sessão; devolve a SessaoResponse final. Lança o ErroApi. */
    encerrar() {
      return enfileirar(async () => {
        const final = await api.encerrarSessao(exigirSessao().id);
        aplicar(final);
        return final;
      });
    },

    /** Promessa que resolve quando a fila esvazia. */
    ocioso() {
      return fila.then(() => undefined);
    },

    sessao: () => sessao,
    aberta: () => Boolean(sessao) && sessao.status !== 'ENCERRADA',
    pendentes: () => pendentes.length,

    /**
     * Números para o HUD: os do servidor mais as estimativas dos tiros ainda na fila
     * (cada tiro na fila já gastou uma flecha que o servidor ainda não descontou). `mercado` = lotes restantes.
     */
    estado() {
      if (!sessao) return null;
      const flechas = {};
      for (const [tipo, n] of Object.entries(sessao.flechas || {})) flechas[tipo] = numero(n);
      for (const p of pendentes) flechas[p.flecha] = Math.max(0, (flechas[p.flecha] || 0) - 1);
      const ganhosServidor = numero(sessao.ganhos);
      return {
        id: sessao.id,
        campo: sessao.campo,
        status: sessao.status,
        custo: numero(sessao.custo),
        ganhosServidor,
        ganhos: ganhosServidor + pendentes.reduce((s, p) => s + p.estimativa, 0),
        flechas,
        mercado: lotesDaSessao(sessao),
        compradas: { ...(sessao.compradas || {}) },
        acertos: numero(sessao.acertos),
        pendentes: pendentes.length,
      };
    },
  };
}
