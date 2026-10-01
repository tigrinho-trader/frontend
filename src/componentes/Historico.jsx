import { MODOS, TIPOS, formatarFichas, nomeAtivo, sequenciaVitorias } from "../jogo.js";

const ICONE = { GANHOU: "✅", PERDEU: "❌", EMPATOU: "➖", ABERTA: "⏳" };

export default function Historico({ ordens }) {
  const seguidas = sequenciaVitorias(ordens);
  const resolvidas = ordens.filter((o) => o.status !== "ABERTA");
  const ganhas = resolvidas.filter((o) => o.status === "GANHOU").length;
  const saldoRodadas = resolvidas.reduce((soma, o) => soma + Number(o.valorLiquido), 0);

  return (
    <aside className="historico">
      <h2>Suas rodadas</h2>
      <div className="placar">
        <div>
          <span className="rotulo">Sequência</span>
          <span className={`placar-valor ${seguidas >= 3 ? "em-chamas" : ""}`}>
            {seguidas >= 3 ? "🔥 " : ""}
            {seguidas}
          </span>
        </div>
        <div>
          <span className="rotulo">Acertos</span>
          <span className="placar-valor">
            {ganhas}/{resolvidas.length}
          </span>
        </div>
        <div>
          <span className="rotulo">Resultado</span>
          <span className={`placar-valor ${saldoRodadas >= 0 ? "sobe" : "desce"}`}>
            {saldoRodadas > 0 ? "+" : ""}
            {formatarFichas(saldoRodadas)}
          </span>
        </div>
      </div>

      {ordens.length === 0 ? (
        <p className="vazio">Nenhuma rodada ainda. Escolha um jogo e faça a primeira aposta.</p>
      ) : (
        <ul className="lista-rodadas">
          {ordens.slice(0, 20).map((o) => (
            <li key={o.id} className={`item-rodada ${o.status.toLowerCase()}`}>
              <span className="item-icone">{ICONE[o.status]}</span>
              <span className="item-descricao">
                {TIPOS[o.tipo].seta} {nomeAtivo(o.simbolo)}
                <small>
                  {MODOS[o.modo]?.emoji} {MODOS[o.modo]?.nome} · {o.duracaoSegundos}s · aposta{" "}
                  {formatarFichas(o.valor)}
                </small>
              </span>
              <span className={`item-valor ${Number(o.valorLiquido) >= 0 ? "sobe" : "desce"}`}>
                {o.status === "ABERTA"
                  ? "…"
                  : `${Number(o.valorLiquido) > 0 ? "+" : ""}${formatarFichas(o.valorLiquido)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
