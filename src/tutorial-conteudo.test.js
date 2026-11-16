import { describe, expect, it } from "vitest";
import { listar, slidesTutorial } from "./tutorial-conteudo.js";

const texto = (slides, titulo) => slides.find((s) => s.titulo === titulo).html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("tutorial", () => {
  it("explica o jogo em telas, na ordem (o caminho do dinheiro fica fora do jogo)", () => {
    expect(slidesTutorial().map((s) => s.titulo)).toEqual([
      "Flecha Certeira", "Moedas e carteira", "Campos", "Flechas", "Como atirar", "Cancelar o tiro",
      "Quando o trade acontece", "Resultado de cada flecha", "Taxas do jogo", "Durante a rodada", "Sacar",
    ]);
  });

  it("não cita a corretora pelo nome em nenhuma tela", () => {
    for (const s of slidesTutorial()) {
      expect(`${s.titulo} ${s.html}`).not.toMatch(/deriv/i);
    }
  });

  it("a primeira tela fala de cotação em tempo real, corretora e que o jogo não ganha com a perda", () => {
    const abertura = texto(slidesTutorial(), "Flecha Certeira");
    expect(abertura).toContain("sistema de trading");
    expect(abertura).toContain("cotação das moedas em tempo real");
    expect(abertura).toContain("ligado a uma corretora");
    expect(abertura).toContain("não ganha com a sua perda");
  });

  it("usa as regras de agora: níveis, valor mínimo e taxa de devolução (padrão 1%)", () => {
    const padrao = slidesTutorial();
    expect(texto(padrao, "Flechas")).toContain("Nível 1 = 10, Nível 2 = 20, Nível 3 = 30 moedas");
    expect(texto(padrao, "Flechas")).toContain("a partir de 1 moeda");
    expect(texto(padrao, "Taxas do jogo")).toContain("com taxa de 1% (ex.: 3 flechas de R$ 10 voltam 29,7)");
    expect(texto(padrao, "Taxas do jogo")).toContain("pede um segundo clique");

    const outras = slidesTutorial({ niveis: [5, 15, 25], minimo: 2, taxaDevolucao: 0.005 });
    expect(texto(outras, "Flechas")).toContain("Nível 1 = 5, Nível 2 = 15, Nível 3 = 25 moedas");
    expect(texto(outras, "Taxas do jogo")).toContain("com taxa de 0,5% (ex.: 3 flechas de R$ 10 voltam 29,85)");
  });

  it("o lucro não é exatamente 90%: mostra as pequenas perdas do arredondamento em dólar, com o exemplo", () => {
    const resultado = texto(slidesTutorial(), "Resultado de cada flecha");
    expect(resultado).toContain("90,1%");
    expect(resultado).toContain("arredondado para baixo no centavo de dólar");
    expect(resultado).toContain("até uns R$ 0,10 por flecha");
    expect(resultado).toContain("R$ 8,94 (em vez de R$ 9,01)");
  });

  it("mostra os campos liberados, os em desenvolvimento e a entrada livre", () => {
    const campos = texto(slidesTutorial(), "Campos");
    expect(campos).toContain("Liberados: Pico das Águias e Reserva Real");
    expect(campos).toContain("Em desenvolvimento (ainda não dá para entrar): Campo do Vilarejo e Bosque dos Arqueiros");
    expect(campos).toContain("livre por tempo limitado");
    expect(texto(slidesTutorial(), "Flechas")).toContain("Bitcoin e Ethereum: flecha em desenvolvimento");
    expect(texto(slidesTutorial(), "Como atirar")).toContain("5 min no ouro e na prata");
  });

  it("lembra quando o trade abre e como cancelar", () => {
    expect(texto(slidesTutorial(), "Quando o trade acontece")).toContain("abre no instante em que a flecha sai do arco");
    expect(texto(slidesTutorial(), "Quando o trade acontece")).toContain("o pássaro para na altura desse tick");
    expect(texto(slidesTutorial(), "Quando o trade acontece")).toContain("Ele morre só se o contrato ganhou");
    expect(texto(slidesTutorial(), "Quando o trade acontece")).toContain("segura a flecha no arco");
    expect(texto(slidesTutorial(), "Flechas")).toContain("Modo infinito");
    expect(texto(slidesTutorial(), "Cancelar o tiro")).toContain("Puxe para a frente");
  });

  it("lista com vírgulas e 'e'", () => {
    expect(listar([])).toBe("");
    expect(listar(["a"])).toBe("a");
    expect(listar(["a", "b"])).toBe("a e b");
    expect(listar(["a", "b", "c"])).toBe("a, b e c");
  });
});
