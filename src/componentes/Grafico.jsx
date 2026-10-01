const LARGURA = 600;
const ALTURA = 200;
const MARGEM = 12;

/** Linha do preco ao vivo com a linha tracejada do preco de entrada. */
export default function Grafico({ pontos, precoEntrada, situacao }) {
  if (pontos.length < 2) {
    return <div className="grafico vazio">Juntando pontos do gráfico…</div>;
  }
  const precos = pontos.map((p) => p.preco);
  if (precoEntrada != null) precos.push(Number(precoEntrada));
  let min = Math.min(...precos);
  let max = Math.max(...precos);
  if (max - min < max * 0.00002) {
    // preco quase parado: abre uma faixa minima (0,002%) pra linha nao virar ruido
    const meio = (max + min) / 2;
    min = meio - meio * 0.00001;
    max = meio + meio * 0.00001;
  }
  const x = (i) => MARGEM + (i / (pontos.length - 1)) * (LARGURA - 2 * MARGEM);
  const y = (preco) => MARGEM + (1 - (preco - min) / (max - min)) * (ALTURA - 2 * MARGEM);

  const linha = pontos.map((p, i) => `${x(i).toFixed(1)},${y(p.preco).toFixed(1)}`).join(" ");
  const area = `${MARGEM},${ALTURA} ${linha} ${LARGURA - MARGEM},${ALTURA}`;
  const ultimo = pontos[pontos.length - 1];
  const classe = situacao === "GANHOU" ? "ganhando" : situacao === "PERDEU" ? "perdendo" : "neutro";

  return (
    <svg className={`grafico ${classe}`} viewBox={`0 0 ${LARGURA} ${ALTURA}`} preserveAspectRatio="none" role="img"
         aria-label="Gráfico do preço ao vivo">
      <polygon className="grafico-area" points={area} />
      {precoEntrada != null && (
        <line className="grafico-entrada" x1={0} x2={LARGURA} y1={y(Number(precoEntrada))} y2={y(Number(precoEntrada))} />
      )}
      <polyline className="grafico-linha" points={linha} />
      <circle className="grafico-ponto" cx={x(pontos.length - 1)} cy={y(ultimo.preco)} r={5} />
    </svg>
  );
}
