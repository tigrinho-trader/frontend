import { useState } from "react";
import { api, esperarCredito } from "../api.js";
import {
  DEGRAUS_ESCADA,
  TIPOS,
  avancarEscada,
  formatarFichas,
  formatarPreco,
  multiplicador,
  nomeAtivo,
  novaEscada,
  premiosEscada,
  resultadoEscada,
  sacarEscada,
} from "../jogo.js";
import RodadaAtiva from "../componentes/RodadaAtiva.jsx";

const FIM = {
  CAIU: "A escada caiu",
  SACOU: "Você sacou",
  TOPO: "🐯 Chegou no topo!",
};

/**
 * "Deixa rodar": cada acerto sobe um degrau e o premio inteiro vira a proxima aposta.
 * Errou, cai tudo; da pra sacar entre um degrau e outro.
 */
export default function Escada({ usuario, regras, regraModo, modo, valor, duracao, cotacoes, historico, saldo,
                                 aoApostar, aoTerminarRodada }) {
  const [simbolo, setSimbolo] = useState(cotacoes[0].simbolo);
  const [escada, setEscada] = useState(null);
  const [ordemId, setOrdemId] = useState(null);
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState(null);

  const valorMaximo = Number(regras.valorMaximo);
  const premios = premiosEscada(escada?.valorInicial ?? valor, multiplicador(regraModo, "ALTA"), valorMaximo);
  const vitorias = escada ? escada.degraus.filter((d) => d.status === "GANHOU").length : 0;

  const subir = async (tipo) => {
    setErro(null);
    try {
      const ordem = await api.apostar(usuario, {
        simbolo,
        tipo,
        modo,
        valor: escada.valorAtual,
        duracaoSegundos: duracao,
      });
      setOrdemId(ordem.id);
      aoApostar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const aoTerminar = async (ordem) => {
    aoTerminarRodada();
    const proxima = avancarEscada(escada, ordem, valorMaximo);
    if (ordem.status === "GANHOU" && !proxima.fim) {
      // o premio precisa estar na carteira antes de virar a proxima aposta
      setAguardando(true);
      await esperarCredito(usuario, ordem.id);
      setAguardando(false);
    }
    setEscada(proxima);
  };

  const proximoDegrau = () => setOrdemId(null);

  const recomecar = () => {
    setEscada(null);
    setOrdemId(null);
    setErro(null);
  };

  return (
    <div className="escada">
      <ol className="degraus" aria-label="Degraus da escada">
        {premios
          .map((premio, i) => {
            const feito = i < vitorias;
            const atual = escada && !escada.fim && i === vitorias;
            const caiu = escada?.fim === "CAIU" && i === vitorias;
            return (
              <li key={i} className={`degrau ${feito ? "feito" : ""} ${atual ? "atual" : ""} ${caiu ? "caiu" : ""}`}>
                <span className="degrau-numero">{i + 1}</span>
                <span className="degrau-premio">{formatarFichas(premio)}</span>
              </li>
            );
          })
          .reverse()}
      </ol>

      <div className="escada-jogo">
        {!escada && (
          <>
            <p>
              Escolha o ativo e comece com <strong>{formatarFichas(valor)}</strong> fichas. A cada degrau você escolhe
              o palpite de novo. São {DEGRAUS_ESCADA} degraus até o topo.
            </p>
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
            <button className="botao-principal" disabled={valor > saldo} onClick={() => setEscada(novaEscada(valor))}>
              Começar a subir
            </button>
          </>
        )}

        {escada && !escada.fim && !ordemId && (
          <>
            <p className="escada-titulo">
              Degrau {vitorias + 1} de {DEGRAUS_ESCADA} · apostando <strong>{formatarFichas(escada.valorAtual)}</strong>{" "}
              em {nomeAtivo(simbolo)}
            </p>
            <div className="botoes-aposta">
              {Object.entries(TIPOS).map(([tipo, t]) => (
                <button key={tipo} className={`botao-aposta aposta-${tipo.toLowerCase()}`} onClick={() => subir(tipo)}>
                  <span className="seta">{t.seta}</span>
                  <span className="nome">{t.nome}</span>
                  <span className="paga">
                    → {formatarFichas(escada.valorAtual * multiplicador(regraModo, tipo))}
                  </span>
                </button>
              ))}
            </div>
            {vitorias > 0 && (
              <button className="botao-secundario" onClick={() => setEscada(sacarEscada(escada))}>
                Sacar agora e parar com {formatarFichas(escada.valorAtual)}
              </button>
            )}
          </>
        )}

        {escada && ordemId && (
          <RodadaAtiva
            usuario={usuario}
            ordemId={ordemId}
            historico={historico}
            regras={regras}
            aoTerminar={aoTerminar}
            acoes={() =>
              aguardando ? (
                <span className="dica">Guardando o prêmio na carteira…</span>
              ) : escada.fim ? null : (
                <>
                  <button className="botao-principal" onClick={proximoDegrau}>
                    Subir mais um degrau
                  </button>
                  {vitorias > 0 && (
                    <button className="botao-secundario" onClick={() => setEscada(sacarEscada(escada))}>
                      Sacar {formatarFichas(escada.valorAtual)}
                    </button>
                  )}
                </>
              )
            }
          />
        )}

        {escada?.fim && (
          <div className={`escada-fim fim-${escada.fim.toLowerCase()}`}>
            <h3>{FIM[escada.fim]}</h3>
            <p>
              Resultado da escada:{" "}
              <strong className={resultadoEscada(escada) >= 0 ? "sobe" : "desce"}>
                {resultadoEscada(escada) > 0 ? "+" : ""}
                {formatarFichas(resultadoEscada(escada))} fichas
              </strong>
            </p>
            <button className="botao-principal" onClick={recomecar}>
              Nova escada
            </button>
          </div>
        )}

        {erro && <p className="aviso erro">{erro}</p>}
      </div>
    </div>
  );
}
