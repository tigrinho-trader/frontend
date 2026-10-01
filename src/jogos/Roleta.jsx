import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { TIPOS, anguloRoleta, fatiasRoleta, formatarFichas, nomeAtivo, sortearFatia } from "../jogo.js";
import RodadaAtiva from "../componentes/RodadaAtiva.jsx";

const GIRO_MS = 4200;
const CORES = ["#f59e0b", "#b45309", "#7c2d12"];

/** A roleta sorteia ativo e palpite; o jogador so escolhe modo, aposta e duracao. */
export default function Roleta({ usuario, regras, modo, valor, duracao, cotacoes, historico, saldo, aoApostar,
                                 aoTerminarRodada }) {
  const fatias = useMemo(() => fatiasRoleta(cotacoes.map((c) => c.simbolo)), [cotacoes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rotacao, setRotacao] = useState(0);
  const [girando, setGirando] = useState(false);
  const [sorteada, setSorteada] = useState(null);
  const [ordemId, setOrdemId] = useState(null);
  const [erro, setErro] = useState(null);
  const timer = useRef();

  useEffect(() => () => clearTimeout(timer.current), []);

  const fatiaGraus = 360 / fatias.length;
  const fundo = `conic-gradient(${fatias
    .map((_, i) => `${CORES[i % CORES.length]} ${i * fatiaGraus}deg ${(i + 1) * fatiaGraus}deg`)
    .join(", ")})`;

  const girar = () => {
    setErro(null);
    setSorteada(null);
    const indice = sortearFatia(fatias.length);
    setRotacao((atual) => anguloRoleta(indice, fatias.length, atual));
    setGirando(true);
    timer.current = setTimeout(async () => {
      const fatia = fatias[indice];
      setSorteada(fatia);
      try {
        const ordem = await api.apostar(usuario, {
          simbolo: fatia.simbolo,
          tipo: fatia.tipo,
          modo,
          valor,
          duracaoSegundos: duracao,
        });
        setOrdemId(ordem.id);
        aoApostar();
      } catch (e) {
        setErro(e.message);
      } finally {
        setGirando(false);
      }
    }, GIRO_MS);
  };

  return (
    <div className="roleta">
      <div className="roleta-lado">
        <div className="roleta-moldura">
          <div className="roleta-ponteiro" aria-hidden="true">▼</div>
          <div
            className="roleta-disco"
            style={{ background: fundo, transform: `rotate(${rotacao}deg)`, transitionDuration: `${GIRO_MS}ms` }}
          >
            {fatias.map((f, i) => (
              <span
                key={`${f.simbolo}-${f.tipo}`}
                className="roleta-rotulo"
                style={{ transform: `rotate(${i * fatiaGraus + fatiaGraus / 2}deg) translateY(-118px)` }}
              >
                {TIPOS[f.tipo].seta}
                <br />
                {nomeAtivo(f.simbolo)}
              </span>
            ))}
            <div className="roleta-centro">🐯</div>
          </div>
        </div>
        {!ordemId && (
          <button className="botao-principal" disabled={girando || valor > saldo} onClick={girar}>
            {girando ? "Girando…" : `Girar a roleta · ${formatarFichas(valor)} fichas`}
          </button>
        )}
        {sorteada && (
          <p className="sorteio">
            Saiu: <strong>{TIPOS[sorteada.tipo].nome}</strong> em <strong>{nomeAtivo(sorteada.simbolo)}</strong>
          </p>
        )}
        {erro && <p className="aviso erro">{erro}</p>}
      </div>

      <div className="roleta-lado">
        {ordemId ? (
          <RodadaAtiva
            usuario={usuario}
            ordemId={ordemId}
            historico={historico}
            regras={regras}
            aoTerminar={aoTerminarRodada}
            acoes={() => (
              <button
                className="botao-principal"
                onClick={() => {
                  setOrdemId(null);
                  setSorteada(null);
                }}
              >
                Girar de novo
              </button>
            )}
          />
        ) : (
          <div className="roleta-explica">
            <p>
              São {fatias.length} fatias: cada ativo com <strong>Sobe</strong>, <strong>Desce</strong> e{" "}
              <strong>Parado</strong>. Onde o ponteiro parar, a aposta é feita na hora.
            </p>
            <p>O modo escolhido acima vale para a rodada sorteada.</p>
          </div>
        )}
      </div>
    </div>
  );
}
