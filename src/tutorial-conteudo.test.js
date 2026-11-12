import { describe, expect, it } from "vitest";
import { listar, slidesTutorial } from "./tutorial-conteudo.js";

const texto = (slides, titulo) => slides.find((s) => s.titulo === titulo).html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("tutorial", () => {
  it("explica o jogo em telas, na ordem", () => {
    expect(slidesTutorial().map((s) => s.titulo)).toEqual([
      "Flecha Certeira", "Moedas e carteira", "Campos", "Flechas", "Como atirar", "Cancelar o tiro",
      "Quando o trade acontece", "Resultado de cada flecha", "Taxas do jogo", "Caminho do dinheiro: onde ele encolhe",
      "E na volta", "Durante a rodada", "Sacar",
    ]);
  });

  it("usa as regras de agora: níveis, valor mínimo e taxa de devolução", () => {
    const padrao = slidesTutorial();
    expect(texto(padrao, "Flechas")).toContain("Nível 1 = 10, Nível 2 = 20, Nível 3 = 30 moedas");
    expect(texto(padrao, "Flechas")).toContain("a partir de 1 moeda");
    expect(texto(padrao, "Taxas do jogo")).toContain("com taxa de 0,2%");

    const outras = slidesTutorial({ niveis: [5, 15, 25], minimo: 2, taxaDevolucao: 0.01 });
    expect(texto(outras, "Flechas")).toContain("Nível 1 = 5, Nível 2 = 15, Nível 3 = 25 moedas");
    expect(texto(outras, "Taxas do jogo")).toContain("com taxa de 1%");
  });

  it("mostra os campos liberados, os em desenvolvimento e a entrada livre", () => {
    const campos = texto(slidesTutorial(), "Campos");
    expect(campos).toContain("Liberados: Pico das Águias e Reserva Real");
    expect(campos).toContain("Em desenvolvimento (ainda não dá para entrar): Campo do Vilarejo e Bosque dos Arqueiros");
    expect(campos).toContain("livre por tempo limitado");
    expect(texto(slidesTutorial(), "Flechas")).toContain("Bitcoin, Ethereum e Ouro PAXG: flecha em desenvolvimento");
  });

  it("explica o caminho do dinheiro e onde ele encolhe, com o exemplo real", () => {
    const caminho = texto(slidesTutorial(), "Caminho do dinheiro: onde ele encolhe");
    for (const etapa of ["Pix no Asaas", "Asaas → Binance", "Real → dólar (USDT)", "Binance → carteira ponte",
      "Carteira ponte → Deriv", "USDT → USD na Deriv"]) {
      expect(caminho).toContain(etapa);
    }
    expect(caminho).toContain("R$ 39,21");
    expect(caminho).toContain("R$ 40 viraram +US$ 7,12");
    expect(texto(slidesTutorial(), "E na volta")).toContain("o saque da Deriv é manual");
  });

  it("lembra quando o trade abre e como cancelar", () => {
    expect(texto(slidesTutorial(), "Quando o trade acontece")).toContain("abre no instante em que a flecha sai do arco");
    expect(texto(slidesTutorial(), "Cancelar o tiro")).toContain("Puxe para a frente");
  });

  it("lista com vírgulas e 'e'", () => {
    expect(listar([])).toBe("");
    expect(listar(["a"])).toBe("a");
    expect(listar(["a", "b"])).toBe("a e b");
    expect(listar(["a", "b", "c"])).toBe("a, b e c");
  });
});
