// Preferências do jogador que o jogo consulta. Vêm do perfil (user-service); sem perfil, valem os padrões.

/** BINARIO: escolhe só se o BTC sobe ou desce. PREVISAO: mira o preço exato daqui a 5 s. */
export const MODOS_FLECHA_BITCOIN = ['BINARIO', 'PREVISAO'];
const PADRAO = 'BINARIO';

let modoFlechaBitcoin = PADRAO;

export const modoDaFlechaBitcoin = () => modoFlechaBitcoin;

/** Atualiza as preferências a partir do perfil (null = volta aos padrões). */
export function definirPreferencias(perfil) {
  const modo = perfil?.modoFlechaBitcoin;
  modoFlechaBitcoin = MODOS_FLECHA_BITCOIN.includes(modo) ? modo : PADRAO;
}
