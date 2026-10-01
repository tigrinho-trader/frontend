import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { PARAMETROS_PADRAO } from "./barreira.js";

const PONTOS_GRAFICO = 120;

/** Cotacoes ao vivo (1 por segundo) + historico curto por ativo pro grafico. */
export function useCotacoes() {
  const [cotacoes, setCotacoes] = useState([]);
  const [historico, setHistorico] = useState({});
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    let timer;
    const buscar = async () => {
      try {
        const lista = await api.cotacoes();
        if (!vivo) return;
        setCotacoes(lista);
        setErro(null);
        setHistorico((anterior) => {
          const novo = { ...anterior };
          for (const c of lista) {
            const pontos = novo[c.simbolo] || [];
            const ultimo = pontos[pontos.length - 1];
            if (!ultimo || ultimo.em !== c.atualizadoEm) {
              novo[c.simbolo] = [...pontos, { em: c.atualizadoEm, preco: Number(c.preco), recebido: Date.now() }].slice(
                -PONTOS_GRAFICO,
              );
            }
          }
          return novo;
        });
      } catch (e) {
        if (vivo) setErro(e.message);
      }
      if (vivo) timer = setTimeout(buscar, 1000);
    };
    buscar();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, []);

  return { cotacoes, historico, erro };
}

/** Parametros da aposta "sem toque" e volatilidade de cada ativo (atualiza a cada 10s). */
export function useParametrosBarreira() {
  const [parametros, setParametros] = useState(PARAMETROS_PADRAO);
  useEffect(() => {
    let vivo = true;
    const buscar = () =>
      api
        .barreira()
        .then((p) => vivo && setParametros(p))
        .catch(() => {});
    buscar();
    const t = setInterval(buscar, 10000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);
  return parametros;
}

/** Acompanha uma rodada ate ela fechar e avisa uma unica vez quando terminar. */
export function useRodada(usuario, ordemId, aoTerminar) {
  const [ordem, setOrdem] = useState(null);
  const avisou = useRef(false);
  const callback = useRef(aoTerminar);
  callback.current = aoTerminar;

  useEffect(() => {
    if (!ordemId) return undefined;
    avisou.current = false;
    setOrdem(null);
    let vivo = true;
    let timer;
    const consultar = async () => {
      try {
        const atual = await api.ordem(usuario, ordemId);
        if (!vivo) return;
        setOrdem(atual);
        if (atual.status !== "ABERTA") {
          if (!avisou.current) {
            avisou.current = true;
            callback.current?.(atual);
          }
          return;
        }
      } catch {
        // gateway oscilou: tenta de novo no proximo ciclo
      }
      if (vivo) timer = setTimeout(consultar, 1000);
    };
    consultar();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [usuario, ordemId]);

  return ordem;
}

/** Relogio que atualiza a tela 4x por segundo (contagem regressiva). */
export function useAgora(ativo = true) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!ativo) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [ativo]);
  return agora;
}

/** Carteira e rodadas do jogador, recarregaveis sob demanda. */
export function useJogador(usuario) {
  const [carteira, setCarteira] = useState(null);
  const [ordens, setOrdens] = useState([]);

  const atualizar = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([api.carteira(usuario), api.ordens(usuario)]);
      setCarteira(c);
      setOrdens(o);
    } catch {
      // mantem o ultimo valor conhecido
    }
  }, [usuario]);

  useEffect(() => {
    atualizar();
  }, [atualizar]);

  return { carteira, ordens, atualizar };
}

/** Le/grava no localStorage sem quebrar quando o navegador bloqueia. */
export function useArmazenado(chave, inicial) {
  const [valor, setValor] = useState(() => {
    try {
      const salvo = localStorage.getItem(chave);
      return salvo == null ? inicial : JSON.parse(salvo);
    } catch {
      return inicial;
    }
  });
  const gravar = useCallback(
    (novo) => {
      setValor(novo);
      try {
        if (novo == null) localStorage.removeItem(chave);
        else localStorage.setItem(chave, JSON.stringify(novo));
      } catch {
        // sem armazenamento: vale so nesta aba
      }
    },
    [chave],
  );
  return [valor, gravar];
}
