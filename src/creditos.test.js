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

describe("Pix", () => {
  it("monta os pacotes a partir do servidor, sem repetidos e em ordem", async () => {
    const { pacotesDoServidor, PACOTES: padrao } = await import("./creditos.js");
    const p = pacotesDoServidor([1000, 100, 5000, 500, 100, -3, "x"]);
    expect(p.map((x) => x.moedas)).toEqual([100, 500, 1000, 5000]);
    expect(p.map((x) => x.nome)).toEqual(["Punhado", "Saco", "Baú", "Tesouro"]);
    expect(p.find((x) => x.destaque).moedas).toBe(1000);
    expect(pacotesDoServidor([])).toBe(padrao);
    expect(pacotesDoServidor(undefined)).toBe(padrao);
    expect(pacotesDoServidor([200]).map((x) => x.destaque)).toEqual([undefined]);
    expect(pacotesDoServidor([1, 2, 3, 4, 5, 6, 7]).at(-1).nome).toBe("7 moedas");
  });

  it("preço em reais", async () => {
    const { precoEmReais } = await import("./creditos.js");
    expect(precoEmReais(500, 1).replace(/\s/g, " ")).toBe("R$ 5,00");
    expect(precoEmReais(5000, 2).replace(/\s/g, " ")).toBe("R$ 100,00");
  });

  it("mostra o preço nos cartões só quando informado", async () => {
    const { htmlPacotes, PACOTES: padrao } = await import("./creditos.js");
    expect(htmlPacotes(padrao, null, 1)).toContain("pacote-preco");
    expect(htmlPacotes(padrao)).not.toContain("pacote-preco");
  });

  it("aceita só QR Code como data URL PNG", async () => {
    const { qrCodeSeguro } = await import("./creditos.js");
    expect(qrCodeSeguro("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(qrCodeSeguro("https://evil.example/qr.png")).toBeNull();
    expect(qrCodeSeguro('data:image/png;base64,AA" onerror="x')).toBeNull();
    expect(qrCodeSeguro(null)).toBeNull();
  });

  it("tempo restante em mm:ss", async () => {
    const { tempoRestante } = await import("./creditos.js");
    const agora = Date.parse("2026-10-11T12:00:00Z");
    expect(tempoRestante("2026-10-11T12:29:05Z", agora)).toBe("29:05");
    expect(tempoRestante("2026-10-11T11:59:00Z", agora)).toBeNull();
    expect(tempoRestante(null, agora)).toBeNull();
    expect(tempoRestante("nao e data", agora)).toBeNull();
  });

  it("503 do Pix tem mensagem própria", () => {
    expect(mensagemErroCompra(new ErroApi(503, "AbacatePay indisponivel"))).toBe(
      "O Pix está indisponível agora: AbacatePay indisponivel",
    );
  });
});
