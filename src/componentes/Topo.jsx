import { useEffect, useRef, useState } from "react";
import { formatarFichas } from "../jogo.js";

export default function Topo({ usuario, carteira, aoSair, aoRecarregar }) {
  const saldo = carteira ? Number(carteira.saldo) : null;
  const anterior = useRef(saldo);
  const [pulso, setPulso] = useState(null);

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
      <div className="marca">
        <span className="marca-emoji">🐯</span>
        <span>
          Tigrinho <strong>Trader</strong>
        </span>
      </div>
      <div className="topo-direita">
        <div className={`saldo ${pulso || ""}`} aria-live="polite">
          <span className="saldo-rotulo">Fichas</span>
          <span className="saldo-valor">🪙 {saldo == null ? "…" : formatarFichas(saldo)}</span>
        </div>
        {saldo != null && saldo < 5 && (
          <button className="botao-secundario" onClick={aoRecarregar}>
            Recarregar 1.000
          </button>
        )}
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
