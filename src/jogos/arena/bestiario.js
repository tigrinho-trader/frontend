// Bestiario da Arena do Tigre. Cada animal e uma aposta "sem toque": ele ataca de cima (lado 1, alvo acima do
// preco) ou de baixo (lado -1, alvo abaixo). `chance` e a chance de o tigre sair ileso; quanto mais forte o animal,
// mais perto do preco ele fica, menor a chance e maior o premio (~0,95 / chance).

import { alvoNaDistancia, distanciaParaChance, faixaPermitida, multiplicador } from "../../barreira.js";

export const BESTIARIO = [
  { id: "pardal", nome: "Pardal", emoji: "🐦", lado: 1, chance: 0.85, nivel: 1 },
  { id: "rato", nome: "Rato", emoji: "🐀", lado: -1, chance: 0.85, nivel: 1 },
  { id: "morcego", nome: "Morcego", emoji: "🦇", lado: 1, chance: 0.7, nivel: 2 },
  { id: "cobra", nome: "Cobra", emoji: "🐍", lado: -1, chance: 0.7, nivel: 2 },
  { id: "aguia", nome: "Águia", emoji: "🦅", lado: 1, chance: 0.55, nivel: 3 },
  { id: "jacare", nome: "Jacaré", emoji: "🐊", lado: -1, chance: 0.55, nivel: 3 },
  { id: "dragao", nome: "Dragão", emoji: "🐉", lado: 1, chance: 0.3, nivel: 4, chefe: true },
  { id: "rinoceronte", nome: "Rinoceronte", emoji: "🦏", lado: -1, chance: 0.3, nivel: 4, chefe: true },
];

export const ONDAS = 5;
export const DURACAO_COMBATE = 30;
export const SEGUNDOS_ESCOLHA = 8;

/**
 * Animais de uma onda: 3 desafiantes, pelo menos um do ceu e um do chao, ficando mais fortes a cada onda;
 * a ultima traz um chefe.
 */
export function sortearOnda(numero, aleatorio = Math.random) {
  // ondas 1-2 ate nivel 2, ondas 3-4 ate nivel 3; o terceiro desafiante sempre tem de onde sair sem repetir
  const nivelMaximo = Math.min(3, 1 + Math.ceil(numero / 2));
  const comuns = BESTIARIO.filter((a) => !a.chefe && a.nivel <= nivelMaximo);
  const pegar = (lista) => lista[Math.floor(aleatorio() * lista.length) % lista.length];

  const escolhidos = [pegar(comuns.filter((a) => a.lado === 1)), pegar(comuns.filter((a) => a.lado === -1))];
  if (numero === ONDAS) {
    escolhidos.push(pegar(BESTIARIO.filter((a) => a.chefe)));
  } else {
    const resto = comuns.filter((a) => !escolhidos.includes(a));
    escolhidos.push(pegar(resto.length ? resto : comuns));
  }
  return escolhidos.map((animal, i) => ({ ...animal, chave: `${numero}-${i}-${animal.id}` }));
}

/** Distancia do ataque do animal, dentro do que o backend aceita. */
export function distanciaDoAnimal(animal, sigma, parametros) {
  const faixa = faixaPermitida(sigma, DURACAO_COMBATE, parametros);
  const ideal = distanciaParaChance(animal.chance, sigma, DURACAO_COMBATE);
  return Math.min(faixa.maxima, Math.max(faixa.minima, ideal));
}

export function alvoDoAnimal(animal, preco, sigma, parametros) {
  return alvoNaDistancia(preco, distanciaDoAnimal(animal, sigma, parametros), animal.lado);
}

export function premioDoAnimal(animal, sigma, parametros) {
  return multiplicador(distanciaDoAnimal(animal, sigma, parametros), sigma, DURACAO_COMBATE, parametros);
}
