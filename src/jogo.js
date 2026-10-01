// Formatacao e resumos usados pelas telas.

const numero = (casas) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function formatarMoedas(valor) {
  return numero(2).format(Number(valor) || 0);
}

/** Preco com casas suficientes pra ver o movimento: BTC com 2, moedas baratas com ate 6. */
export function formatarPreco(valor) {
  const v = Number(valor) || 0;
  const casas = v >= 1000 ? 2 : v >= 1 ? 4 : 6;
  return numero(casas).format(v);
}

export function nomeAtivo(simbolo) {
  return simbolo.replace(/USDT$/, "");
}

/** Vitorias seguidas a partir da rodada mais recente ja resolvida (empate nao quebra nem soma). */
export function sequenciaVitorias(ordens) {
  let seguidas = 0;
  for (const o of ordens) {
    if (o.status === "ABERTA" || o.status === "EMPATOU") continue;
    if (o.status !== "GANHOU") break;
    seguidas++;
  }
  return seguidas;
}

/** Como a rodada aparece no diario: aposta "sem toque" de cima/baixo ou as rodadas classicas. */
export function descreverRodada(ordem) {
  if (ordem.tipo === "BARREIRA") {
    const acima = Number(ordem.alvo) > Number(ordem.precoEntrada);
    return { icone: acima ? "☁️" : "⛰️", texto: `Sem toque ${acima ? "acima" : "abaixo"}` };
  }
  const tipos = { ALTA: ["▲", "Sobe"], BAIXA: ["▼", "Desce"], LATERAL: ["◆", "Parado"] };
  const [icone, texto] = tipos[ordem.tipo] || ["•", ordem.tipo];
  return { icone, texto };
}
