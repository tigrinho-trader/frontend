import { formatarPreco, nomeAtivo } from "../jogo.js";

export default function Ticker({ cotacoes, historico, erro }) {
  if (erro && cotacoes.length === 0) {
    return <div className="ticker aviso erro">Cotações indisponíveis: {erro}</div>;
  }
  return (
    <div className="ticker">
      {cotacoes.map((c) => {
        const pontos = historico[c.simbolo] || [];
        const anterior = pontos.length > 1 ? pontos[pontos.length - 2].preco : Number(c.preco);
        const tick = Number(c.preco) > anterior ? "sobe" : Number(c.preco) < anterior ? "desce" : "";
        const dia = Number(c.variacaoPercentual24h);
        return (
          <div key={c.simbolo} className="ticker-item">
            <span className="ticker-ativo">{nomeAtivo(c.simbolo)}</span>
            <span className={`ticker-preco ${tick}`}>{formatarPreco(c.preco)}</span>
            <span className={`ticker-dia ${dia >= 0 ? "sobe" : "desce"}`}>
              {dia >= 0 ? "+" : ""}
              {dia.toFixed(2)}% 24h
            </span>
          </div>
        );
      })}
      <span className="ticker-fonte">ao vivo · Binance</span>
    </div>
  );
}
