import { descreverRodada, formatarMoedas, nomeAtivo, sequenciaVitorias } from "../jogo.js";

const ICONE = { GANHOU: "✅", PERDEU: "💥", EMPATOU: "➖", ABERTA: "⏳" };

/** Diario de rodadas do jogador. */
export default function Historico({ ordens }) {
  const seguidas = sequenciaVitorias(ordens);
  const resolvidas = ordens.filter((o) => o.status !== "ABERTA");
  const resultado = resolvidas.reduce((soma, o) => soma + Number(o.valorLiquido), 0);

  return (
    <section className="historico">
      <div className="historico-topo">
        <h2>Diário de bordo</h2>
        <span className={`placar-valor ${resultado >= 0 ? "sobe" : "desce"}`}>
          {resultado > 0 ? "+" : ""}
          {formatarMoedas(resultado)}
        </span>
        {seguidas >= 2 && <span className="sequencia">🔥 {seguidas} seguidas</span>}
      </div>

      {ordens.length === 0 ? (
        <p className="vazio">Nada por aqui ainda. Escolha um jogo e vá à luta.</p>
      ) : (
        <ul className="lista-rodadas">
          {ordens.slice(0, 12).map((o) => {
            const { icone, texto } = descreverRodada(o);
            return (
              <li key={o.id} className={`item-rodada ${o.status.toLowerCase()}`}>
                <span className="item-icone">{ICONE[o.status]}</span>
                <span className="item-descricao">
                  {icone} {texto} · {nomeAtivo(o.simbolo)}
                  <small>
                    {o.duracaoSegundos}s · aposta {formatarMoedas(o.valor)} · {formatarMoedas(o.multiplicador)}x
                  </small>
                </span>
                <span className={`item-valor ${Number(o.valorLiquido) >= 0 ? "sobe" : "desce"}`}>
                  {o.status === "ABERTA"
                    ? "…"
                    : `${Number(o.valorLiquido) > 0 ? "+" : ""}${formatarMoedas(o.valorLiquido)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
