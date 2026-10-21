import { describe, expect, it } from "vitest";
import { ErroApi } from "./api.js";
import {
  LIMITES_PADRAO, PACOTES, PACOTE_POR_ID, faixaEmReais, htmlPacotes, mensagemErroCompra, moedasDoValor, textoFaixa,
  precoEmReais, valorDasMoedas,
} from "./creditos.js";

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

describe("valor livre em reais", () => {
  const PIX = { centavosPorMoeda: 100, ...LIMITES_PADRAO.pix };   // R$ 1 = 1 moeda
  const sem = (t) => t.replace(/\s/g, " ");

  it("faixa padrão do Pix vai de R$ 5 a R$ 2.000 (5 a 2.000 moedas)", () => {
    expect(faixaEmReais(PIX)).toEqual({ min: 5, max: 2000 });
    expect(sem(textoFaixa(PIX))).toBe("de R$ 5 a R$ 2.000");
    expect(faixaEmReais({ centavosPorMoeda: 100, ...LIMITES_PADRAO.sandbox })).toEqual({ min: 1, max: 5000 });
  });

  it("converte reais inteiros em moedas (R$ 1 = 1 moeda)", () => {
    expect(moedasDoValor("5", PIX)).toEqual({ moedas: 5 });
    expect(moedasDoValor("25", PIX)).toEqual({ moedas: 25 });
    expect(moedasDoValor(" R$ 37 ", PIX)).toEqual({ moedas: 37 });
    expect(moedasDoValor("2.000", PIX)).toEqual({ moedas: 2000 });
    expect(moedasDoValor("12,00", PIX)).toEqual({ moedas: 12 });
    expect(precoEmReais(25, 100).replace(/\s/g, " ")).toBe("R$ 25,00");
  });

  it("campo vazio não é erro", () => {
    expect(moedasDoValor("", PIX)).toEqual({ moedas: null });
    expect(moedasDoValor("   ", PIX)).toEqual({ moedas: null });
    expect(moedasDoValor(undefined, PIX)).toEqual({ moedas: null });
  });

  it("recusa centavos, texto e valores fora da faixa", () => {
    expect(moedasDoValor("2,50", PIX).erro).toContain("inteiro");
    expect(moedasDoValor("2.5", PIX).erro).toContain("inteiro");
    for (const t of ["abc", "0", "4", "-5", "2001", "1e3", "10 reais"]) {
      const r = moedasDoValor(t, PIX);
      expect(r.moedas).toBeNull();
      expect(sem(r.erro)).toBe("Escolha um valor de R$ 5 a R$ 2.000.");
    }
  });

  it("respeita o mínimo em moedas mesmo quando o preço não fecha em reais", () => {
    const caro = { centavosPorMoeda: 30, minimoMoedas: 10, maximoMoedas: 100 };
    expect(faixaEmReais(caro)).toEqual({ min: 3, max: 30 });
    expect(moedasDoValor("3", caro)).toEqual({ moedas: 10 });
    expect(moedasDoValor("4", caro)).toEqual({ moedas: 13 });
  });

  it("valor de um pacote em reais inteiros, ou vazio se não fechar", () => {
    expect(valorDasMoedas(1000, 10)).toBe("100");
    expect(valorDasMoedas(25, 100)).toBe("25");
    expect(valorDasMoedas(15, 10)).toBe("");
    expect(valorDasMoedas(undefined, 10)).toBe("");
  });
});