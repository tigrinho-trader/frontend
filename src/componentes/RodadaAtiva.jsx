import { useMemo } from "react";
import { useAgora, useRodada } from "../ganchos.js";
import {
  MODOS,
  TIPOS,
  formatarFichas,
  formatarPreco,
  nomeAtivo,
  segundosRestantes,
  situacaoParcial,
  variacaoPercentual,
} from "../jogo.js";
import Grafico from "./Grafico.jsx";

const TEXTO_SITUACAO = { GANHOU: "ganhando", PERDEU: "perdendo", EMPATOU: "empatado" };

/** Rodada em andamento: grafico, contagem regressiva e o resultado quando fecha. */
export default function RodadaAtiva({ usuario, ordemId, historico, regras, aoTerminar, acoes }) {
  const ordem = useRodada(usuario, ordemId, aoTerminar);
  const aberta = ordem?.status === "ABERTA";
  const agora = useAgora(aberta);

  if (!ordem) return <div className="rodada carregando">Abrindo a rodada…</div>;

  const regraModo = regras.modos.find((m) => m.modo === ordem.modo);
  const pontos = historico[ordem.simbolo] || [];
  const precoAtual = aberta ? pontos[pontos.length - 1]?.preco : Number(ordem.precoSaida);
  const situacao = aberta
    ? situacaoParcial(ordem.tipo, regraModo, ordem.precoEntrada, precoAtual)
    : ordem.status;
  const restante = segundosRestantes(ordem.expiraEm, agora);
  const progresso = Math.min(1, 1 - restante / ordem.duracaoSegundos);
  const variacao = variacaoPercentual(ordem.precoEntrada, precoAtual);
  const premio = Number(ordem.valor) * Number(ordem.multiplicador);

  return (
    <div className={`rodada situacao-${situacao.toLowerCase()}`}>
      <div className="rodada-cabecalho">
        <span className="etiqueta">
          {MODOS[ordem.modo].emoji} {MODOS[ordem.modo].nome}
        </span>
        <span className="rodada-aposta">
          {TIPOS[ordem.tipo].seta} {TIPOS[ordem.tipo].nome} em <strong>{nomeAtivo(ordem.simbolo)}</strong> ·{" "}
          {formatarFichas(ordem.valor)} fichas · paga {formatarFichas(premio)}
        </span>
      </div>

      <Grafico pontos={pontos} precoEntrada={ordem.precoEntrada} situacao={situacao} />

      <div className="rodada-numeros">
        <div>
          <span className="rotulo">Entrada</span>
          <span>{formatarPreco(ordem.precoEntrada)}</span>
        </div>
        <div>
          <span className="rotulo">{aberta ? "Agora" : "Saída"}</span>
          <span>{precoAtual != null ? formatarPreco(precoAtual) : "…"}</span>
        </div>
        <div>
          <span className="rotulo">Variação</span>
          <span className={variacao >= 0 ? "sobe" : "desce"}>
            {variacao >= 0 ? "+" : ""}
            {variacao.toFixed(4)}%
          </span>
        </div>
      </div>

      {aberta ? (
        <>
          <div className="barra-tempo">
            <div className="barra-tempo-cheia" style={{ width: `${progresso * 100}%` }} />
          </div>
          <div className="rodada-status">
            {restante > 0 ? (
              <>
                <span className="contagem">{restante}s</span> você está{" "}
                <strong className={`texto-${situacao.toLowerCase()}`}>{TEXTO_SITUACAO[situacao]}</strong>
                {regraModo && Number(regraModo.movimentoMinimoPercentual) > 0 && ordem.tipo !== "LATERAL" && (
                  <span className="dica"> · precisa andar {regraModo.movimentoMinimoPercentual}%</span>
                )}
              </>
            ) : (
              <span className="fechando">Fechando a rodada…</span>
            )}
          </div>
        </>
      ) : (
        <Resultado ordem={ordem} acoes={acoes} />
      )}
    </div>
  );
}

function Resultado({ ordem, acoes }) {
  const liquido = Number(ordem.valorLiquido);
  const moedas = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        esquerda: Math.random() * 100,
        atraso: Math.random() * 0.8,
        duracao: 1.2 + Math.random() * 1.2,
      })),
    [],
  );

  return (
    <div className={`resultado resultado-${ordem.status.toLowerCase()}`} role="status">
      {ordem.status === "GANHOU" && (
        <div className="chuva" aria-hidden="true">
          {moedas.map((m) => (
            <span
              key={m.id}
              style={{ left: `${m.esquerda}%`, animationDelay: `${m.atraso}s`, animationDuration: `${m.duracao}s` }}
            >
              🪙
            </span>
          ))}
        </div>
      )}
      <div className="resultado-titulo">
        {ordem.status === "GANHOU" && "🐯 GANHOU!"}
        {ordem.status === "PERDEU" && "PERDEU"}
        {ordem.status === "EMPATOU" && "EMPATE"}
      </div>
      <div className="resultado-valor">
        {liquido > 0 ? "+" : ""}
        {formatarFichas(liquido)} fichas
      </div>
      {acoes && <div className="resultado-acoes">{acoes(ordem)}</div>}
    </div>
  );
}
