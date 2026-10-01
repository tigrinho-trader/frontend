import { useState } from "react";
import { api } from "../api.js";
import { TIPOS, formatarFichas, formatarPreco, multiplicador, nomeAtivo } from "../jogo.js";
import Grafico from "../componentes/Grafico.jsx";
import RodadaAtiva from "../componentes/RodadaAtiva.jsx";

/** Jogo classico: escolhe o ativo e diz se sobe, desce ou fica parado. */
export default function Palpite({ usuario, regras, regraModo, modo, valor, duracao, cotacoes, historico, saldo,
                                  aoApostar, aoTerminarRodada }) {
  const [simbolo, setSimbolo] = useState(cotacoes[0].simbolo);
  const [ordemId, setOrdemId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  const apostar = async (tipo) => {
    setEnviando(true);
    setErro(null);
    try {
      const ordem = await api.apostar(usuario, { simbolo, tipo, modo, valor, duracaoSegundos: duracao });
      setOrdemId(ordem.id);
      aoApostar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (ordemId) {
    return (
      <RodadaAtiva
        usuario={usuario}
        ordemId={ordemId}
        historico={historico}
        regras={regras}
        aoTerminar={aoTerminarRodada}
        acoes={() => (
          <button className="botao-principal" onClick={() => setOrdemId(null)}>
            Jogar de novo
          </button>
        )}
      />
    );
  }

  const cotacao = cotacoes.find((c) => c.simbolo === simbolo) || cotacoes[0];
  return (
    <div className="palpite">
      <div className="ativos">
        {cotacoes.map((c) => (
          <button
            key={c.simbolo}
            className={`ativo ${c.simbolo === simbolo ? "ativo-escolhido" : ""}`}
            onClick={() => setSimbolo(c.simbolo)}
          >
            <span className="ativo-nome">{nomeAtivo(c.simbolo)}</span>
            <span className="ativo-preco">{formatarPreco(c.preco)}</span>
          </button>
        ))}
      </div>

      <Grafico pontos={historico[cotacao.simbolo] || []} precoEntrada={null} situacao="EMPATOU" />

      <div className="botoes-aposta">
        {Object.entries(TIPOS).map(([tipo, t]) => (
          <button
            key={tipo}
            className={`botao-aposta aposta-${tipo.toLowerCase()}`}
            disabled={enviando || valor > saldo}
            onClick={() => apostar(tipo)}
          >
            <span className="seta">{t.seta}</span>
            <span className="nome">{t.nome}</span>
            <span className="paga">
              {formatarFichas(valor)} → {formatarFichas(valor * multiplicador(regraModo, tipo))}
            </span>
          </button>
        ))}
      </div>
      <p className="dica">
        “Parado” ganha se o preço variar no máximo {regraModo?.toleranciaLateralPercentual}% até o fim da rodada.
      </p>
      {erro && <p className="aviso erro">{erro}</p>}
    </div>
  );
}
