import { useEffect, useRef, useState } from "react";
import { formatarMoedas } from "../jogo.js";
import { alternarMudo, estaMudo } from "../som.js";

export default function Topo({ usuario, carteira, progresso, aoSair, aoRecarregar, aoInicio }) {
  const saldo = carteira ? Number(carteira.saldo) : null;
  const anterior = useRef(saldo);
  const [pulso, setPulso] = useState(null);
  const [mudo, setMudo] = useState(estaMudo());

  // pisca verde/vermelho quando o saldo muda
  useEffect(() => {
    if (saldo == null) return undefined;
    if (anterior.current != null && saldo !== anterior.current) {
      setPulso(saldo > anterior.current ? "subiu" : "desceu");
      const t = setTimeout(() => setPulso(null), 1200);
      anterior.current = saldo;
      return () => clearTimeout(t);
    }
    anterior.current = saldo;
    return undefined;
  }, [saldo]);

  return (
    <header className="topo">
      <button className="marca" onClick={aoInicio}>
        <span className="marca-emoji">🐯</span>
        <span>
          Tigrinho <strong>Trader</strong>
        </span>
      </button>
      <div className="topo-direita">
        <span className="nivel" title={`${progresso.xp} XP`}>
          Nv. {progresso.nivel}
        </span>
        <div className={`saldo ${pulso || ""}`} aria-live="polite">
          🪙 <strong>{saldo == null ? "…" : formatarMoedas(saldo)}</strong>
        </div>
        {saldo != null && saldo < 5 && (
          <button className="botao-secundario" onClick={aoRecarregar}>
            +1.000 moedas
          </button>
        )}
        <button
          className="icone"
          aria-label={mudo ? "Ligar som" : "Desligar som"}
          onClick={() => setMudo(alternarMudo())}
        >
          {mudo ? "🔇" : "🔊"}
        </button>
        <div className="jogador">
          <span>{usuario}</span>
          <button className="link" onClick={aoSair}>
            sair
          </button>
        </div>
      </div>
    </header>
  );
}
