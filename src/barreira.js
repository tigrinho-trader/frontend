// Aposta "sem toque" (BARREIRA): ganha quem escolhe um preco-alvo que o mercado NAO encosta ate o fim da rodada.
// Mesma conta do CalculadoraBarreira do trading-service; os parametros vem de GET /api/ordens/barreira.
// Aqui ela serve pra mostrar o multiplicador ao vivo; o valor que vale e o que o backend devolve na ordem.

export const PARAMETROS_PADRAO = {
  margem: 0.95,
  multiplicadorMinimo: 1.1,
  multiplicadorMaximo: 20,
  distanciaMinima: 0.00001,
  volatilidadePorSegundo: {},
};

const VOLATILIDADE_PADRAO = 0.00008;

/** Abramowitz & Stegun 7.1.26, igual ao backend. */
export function erf(x) {
  const sinal = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const p = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sinal * (1 - p * Math.exp(-a * a));
}

/** Inversa do erf por bissecao (erf e crescente); precisao de sobra pra tela. */
export function erfInversa(y) {
  if (y <= -1) return -Infinity;
  if (y >= 1) return Infinity;
  let baixo = -6;
  let alto = 6;
  for (let i = 0; i < 80; i++) {
    const meio = (baixo + alto) / 2;
    if (erf(meio) < y) baixo = meio;
    else alto = meio;
  }
  return (baixo + alto) / 2;
}

export function volatilidade(parametros, simbolo) {
  return parametros?.volatilidadePorSegundo?.[simbolo] || VOLATILIDADE_PADRAO;
}

/** Distancia (em log) entre o preco e o alvo. */
export function distancia(preco, alvo) {
  return Math.abs(Math.log(alvo / preco));
}

/** Chance de o preco nao encostar no alvo durante a rodada. */
export function chanceSemToque(dist, sigma, duracaoSegundos) {
  return erf(dist / (sigma * Math.sqrt(duracaoSegundos)) / Math.SQRT2);
}

/** Multiplicador com o teto do backend, arredondado pra baixo em 2 casas. */
export function multiplicador(dist, sigma, duracaoSegundos, parametros = PARAMETROS_PADRAO) {
  const chance = chanceSemToque(dist, sigma, duracaoSegundos);
  const bruto = chance <= 0 ? Infinity : parametros.margem / chance;
  return Math.floor(Math.min(bruto, parametros.multiplicadorMaximo) * 100) / 100;
}

/** Distancia em que o alvo sobrevive com a chance pedida (0.7 = 70% de chance de nao ser tocado). */
export function distanciaParaChance(chance, sigma, duracaoSegundos) {
  return Math.SQRT2 * erfInversa(chance) * sigma * Math.sqrt(duracaoSegundos);
}

/** Preco-alvo acima (lado 1) ou abaixo (lado -1) do preco, a uma distancia em log. */
export function alvoNaDistancia(preco, dist, lado) {
  return preco * Math.exp(lado * dist);
}

/**
 * Faixa de distancias aceitas pelo backend com folga: nem colado no preco (recusa por "colado"),
 * nem tao longe que o multiplicador caia abaixo do minimo (recusa por "longe demais").
 */
export function faixaPermitida(sigma, duracaoSegundos, parametros = PARAMETROS_PADRAO) {
  const minima = parametros.distanciaMinima * 2;
  // folga de 3% no multiplicador minimo: a volatilidade pode mudar entre a tela e o backend
  const chanceMaxima = parametros.margem / (parametros.multiplicadorMinimo * 1.03);
  const maxima = distanciaParaChance(chanceMaxima, sigma, duracaoSegundos);
  return { minima, maxima: Math.max(maxima, minima * 2) };
}
