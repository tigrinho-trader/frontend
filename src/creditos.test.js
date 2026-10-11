import { describe, expect, it } from "vitest";
import { ErroApi } from "./api.js";
import { PACOTES, PACOTE_POR_ID, htmlPacotes, mensagemErroCompra } from "./creditos.js";

describe("pacotes de moedas", () => {
  it("ficam dentro do limite por compra do sandbox (5.000) e em ordem crescente", () => {
    const valores = PACOTES.map((p) => p.moedas);
    expect(valores).toEqual([...valores].sort((a, b) => a - b));
    expect(Math.max(...valores)).toBeLessThanOrEqual(5000);
    expect(new Set(PACOTES.map((p) => p.id)).size).toBe(PACOTES.length);
  });

  it("acha o pacote pelo id", () => {
    expect(PACOTE_POR_ID.bau.moedas).toBe(1000);
    expect(PACOTE_POR_ID.inexistente).toBeUndefined();
  });

  it("desenha os cartões e marca o selecionado", () => {
    const html = htmlPacotes(PACOTES, "saco");
    expect(html.match(/data-pacote=/g)).toHaveLength(PACOTES.length);
    expect(html).toContain('class="pacote selecionado" data-pacote="saco"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("1.000");
    expect(html).toContain("Mais escolhido");
  });

  it("escapa textos dos pacotes", () => {
    const html = htmlPacotes([{ id: "x", nome: "<b>oi</b>", moedas: 1, destaque: "<i>" }]);
    expect(html).not.toContain("<b>oi</b>");
    expect(html).toContain("&lt;b&gt;oi&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;");
  });

  it("sem seleção nenhum cartão fica marcado", () => {
    expect(htmlPacotes()).not.toContain("selecionado");
  });
});

describe("mensagens de erro da compra", () => {
  it("pagamentos desligados na carteira", () => {
    expect(mensagemErroCompra(new ErroApi(422, "Pagamentos desabilitados"))).toContain("desligada");
  });

  it("outra recusa do pagamento", () => {
    expect(mensagemErroCompra(new ErroApi(422, "Sandbox recusa deposito acima de 5000"))).toBe(
      "Compra recusada: Sandbox recusa deposito acima de 5000",
    );
  });

  it("falha de rede ou do servidor", () => {
    expect(mensagemErroCompra(new ErroApi(0, "Sem conexão com o servidor"))).toBe(
      "Não foi possível concluir a compra: Sem conexão com o servidor",
    );
  });
});
