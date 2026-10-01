import { FICHAS, MODOS, formatarFichas } from "../jogo.js";

const formatarDuracao = (s) => (s < 60 ? `${s}s` : `${s / 60}min`);

export default function Controles({ regras, modo, aoMudarModo, valor, aoMudarValor, duracao, aoMudarDuracao, saldo }) {
  if (!regras) return null;
  return (
    <div className="controles">
      <div className="modos" role="radiogroup" aria-label="Modo de jogo">
        {regras.modos.map((m) => {
          const visual = MODOS[m.modo];
          return (
            <button
              key={m.modo}
              role="radio"
              aria-checked={m.modo === modo}
              className={`modo modo-${m.modo.toLowerCase()} ${m.modo === modo ? "ativo" : ""}`}
              onClick={() => aoMudarModo(m.modo)}
            >
              <span className="modo-emoji">{visual.emoji}</span>
              <span className="modo-nome">{visual.nome}</span>
              <span className="modo-paga">
                paga {Number(m.multiplicadorDirecional).toFixed(2).replace(".", ",")}x ·{" "}
                {Number(m.multiplicadorLateral).toFixed(2).replace(".", ",")}x
              </span>
              <span className="modo-frase">{visual.frase}</span>
            </button>
          );
        })}
      </div>

      <div className="linha-controles">
        <div className="grupo">
          <span className="rotulo">Aposta</span>
          <div className="fichas">
            {FICHAS.map((f) => (
              <button
                key={f}
                className={`ficha ${f === valor ? "ativa" : ""}`}
                disabled={f > saldo}
                onClick={() => aoMudarValor(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="grupo">
          <span className="rotulo">Duração</span>
          <div className="duracoes">
            {regras.duracoesSegundos.map((d) => (
              <button
                key={d}
                className={`duracao ${d === duracao ? "ativa" : ""}`}
                onClick={() => aoMudarDuracao(d)}
              >
                {formatarDuracao(d)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {valor > saldo && <p className="aviso erro">Aposta maior que o saldo ({formatarFichas(saldo)} fichas).</p>}
    </div>
  );
}
