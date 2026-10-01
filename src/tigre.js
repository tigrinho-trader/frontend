// Progresso do tigre, calculado a partir das rodadas guardadas no trading-service:
// o que o jogador conquistou continua la em qualquer navegador.

const TITULOS = ["Filhote", "Aprendiz", "Caçador", "Guerreiro", "Campeão", "Rei da Selva", "Lenda"];

/** Faixas de multiplicador = forca do adversario vencido (ver bestiario da arena). */
export const TROFEUS = [
  { id: "bronze", nome: "Bronze", emoji: "🥉", minimo: 0 },
  { id: "prata", nome: "Prata", emoji: "🥈", minimo: 1.6 },
  { id: "ouro", nome: "Ouro", emoji: "🥇", minimo: 2.5 },
  { id: "lenda", nome: "Lenda", emoji: "💎", minimo: 5 },
];

/** XP necessario pra chegar no nivel n (1 -> 0, 2 -> 60, 3 -> 180, ...). */
export function xpParaNivel(nivel) {
  return 30 * nivel * (nivel - 1);
}

export function xpDaRodada(ordem) {
  if (ordem.tipo !== "BARREIRA") return 0;
  if (ordem.status === "GANHOU") return Math.round(10 * Number(ordem.multiplicador));
  if (ordem.status === "PERDEU") return 3;
  return 0;
}

export function trofeuDe(multiplicador) {
  return [...TROFEUS].reverse().find((t) => Number(multiplicador) >= t.minimo);
}

export function progressoDoTigre(ordens) {
  const xp = ordens.reduce((soma, o) => soma + xpDaRodada(o), 0);
  let nivel = 1;
  while (xp >= xpParaNivel(nivel + 1)) nivel++;
  const base = xpParaNivel(nivel);
  const proximo = xpParaNivel(nivel + 1);

  const trofeus = Object.fromEntries(TROFEUS.map((t) => [t.id, 0]));
  let vitorias = 0;
  let derrotas = 0;
  let maiorMultiplicador = 0;
  for (const o of ordens) {
    if (o.tipo !== "BARREIRA") continue;
    if (o.status === "GANHOU") {
      vitorias++;
      trofeus[trofeuDe(o.multiplicador).id]++;
      maiorMultiplicador = Math.max(maiorMultiplicador, Number(o.multiplicador));
    } else if (o.status === "PERDEU") {
      derrotas++;
    }
  }

  return {
    xp,
    nivel,
    titulo: TITULOS[Math.min(TITULOS.length - 1, Math.floor((nivel - 1) / 2))],
    progresso: proximo > base ? (xp - base) / (proximo - base) : 1,
    faltam: proximo - xp,
    vitorias,
    derrotas,
    maiorMultiplicador,
    trofeus,
  };
}
