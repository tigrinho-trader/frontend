import { describe, expect, it } from "vitest";
import {
  acoesUsuario,
  classeSinal,
  escaparHtml,
  formatarComSinal,
  formatarData,
  formatarDataHora,
  formatarMoedas,
  htmlExtrato,
  htmlLinhasUsuarios,
  iniciais,
  mensagemErro,
  nomeExibicao,
  paginacao,
  urlSegura,
  validarApelido,
} from "./telas.js";

const TZ = "America/Sao_Paulo";

describe("formatação", () => {
  it("moedas no padrão brasileiro", () => {
    expect(formatarMoedas(1000)).toBe("1.000");
    expect(formatarMoedas("1234.5")).toBe("1.234,5");
    expect(formatarMoedas(null)).toBe("0");
    expect(formatarMoedas("abc")).toBe("0");
  });

  it("valores com sinal e classe de cor", () => {
    expect(formatarComSinal(15)).toBe("+15");
    expect(formatarComSinal(-8)).toBe("−8");
    expect(formatarComSinal(0)).toBe("0");
    expect(classeSinal(3)).toBe("pos");
    expect(classeSinal(-3)).toBe("neg");
    expect(classeSinal(0)).toBe("");
  });

  it("datas em pt-BR", () => {
    expect(formatarDataHora("2026-10-11T17:03:00Z", TZ)).toBe("11/10/2026 14:03");
    expect(formatarData("2026-10-11T17:03:00Z", TZ)).toBe("11/10/2026");
    expect(formatarDataHora(null)).toBe("—");
    expect(formatarData("inválida")).toBe("—");
    expect(formatarDataHora("inválida")).toBe("—");
    expect(formatarData(undefined)).toBe("—");
  });
});

describe("apelido", () => {
  it("aceita letras (com acento), números e _", () => {
    expect(validarApelido("Arqueiro_1")).toBeNull();
    expect(validarApelido("João")).toBeNull();
    expect(validarApelido("  ana  ")).toBeNull();
  });

  it("recusa curto, longo e caracteres inválidos", () => {
    expect(validarApelido("ab")).toMatch(/pelo menos 3/);
    expect(validarApelido(null)).toMatch(/pelo menos 3/);
    expect(validarApelido("a".repeat(21))).toMatch(/no máximo 20/);
    expect(validarApelido("com espaço")).toMatch(/letras, números e _/);
    expect(validarApelido("ana-maria")).toMatch(/letras, números e _/);
  });
});

describe("utilitários", () => {
  it("escapa HTML", () => {
    expect(escaparHtml(`<img src=x onerror="alert('1')">&`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;");
    expect(escaparHtml(null)).toBe("");
  });

  it("só aceita fotos http(s)", () => {
    expect(urlSegura("https://s.gravatar.com/a.png")).toBe("https://s.gravatar.com/a.png");
    expect(urlSegura("javascript:alert(1)")).toBe("");
    expect(urlSegura("data:image/png;base64,xx")).toBe("");
    expect(urlSegura(undefined)).toBe("");
  });

  it("nome de exibição e iniciais", () => {
    expect(nomeExibicao({ apelido: "ana", nome: "Ana Souza" })).toBe("ana");
    expect(nomeExibicao({ nome: "Ana Souza" })).toBe("Ana Souza");
    expect(nomeExibicao({ email: "a@x.com" })).toBe("a@x.com");
    expect(nomeExibicao(null)).toBe("Jogador");
    expect(iniciais("Ana Souza")).toBe("AS");
    expect(iniciais("arqueiro_mestre")).toBe("AM");
    expect(iniciais("élida")).toBe("É");
    expect(iniciais("")).toBe("?");
  });

  it("mensagem de erro", () => {
    expect(mensagemErro({ mensagem: "Saldo insuficiente" })).toBe("Saldo insuficiente");
    expect(mensagemErro(new Error("falhou"))).toBe("falhou");
    expect(mensagemErro(null)).toBe("Algo deu errado. Tente de novo.");
  });
});

describe("extrato", () => {
  const transacoes = Array.from({ length: 12 }, (_, i) => ({
    tipo: i % 2 ? "GANHO_RODADA" : "PERDA_RODADA",
    valor: i % 2 ? 20 : -15,
    descricao: i === 0 ? "<b>xss</b>" : "Rodada",
    criadaEm: "2026-10-11T17:03:00Z",
  }));

  it("mostra só as últimas 10, com tipo, valor colorido, descrição e data", () => {
    const html = htmlExtrato(transacoes, 10, TZ);
    expect(html.match(/<tr>/g)).toHaveLength(10);
    expect(html).toContain("Perda na rodada");
    expect(html).toContain("Ganho na rodada");
    expect(html).toContain('class="valor neg">−15');
    expect(html).toContain('class="valor pos">+20');
    expect(html).toContain("&lt;b&gt;xss&lt;/b&gt;");
    expect(html).toContain("11/10/2026 14:03");
  });

  it("lista vazia e tipo desconhecido", () => {
    expect(htmlExtrato([])).toContain("Nenhuma movimentação");
    expect(htmlExtrato(null)).toContain("Nenhuma movimentação");
    expect(htmlExtrato([{ tipo: "NOVO", valor: 0 }])).toContain("NOVO");
  });
});

describe("administração", () => {
  const eu = { id: "auth0|eu", apelido: "admin", nome: "Admin", email: "a@x.com", papel: "ADMIN", status: "ATIVO" };
  const ativo = { id: "auth0|1", apelido: "ana", nome: "Ana", email: "ana@x.com", papel: "JOGADOR", status: "ATIVO", ultimoAcessoEm: "2026-10-11T17:03:00Z" };
  const bloqueado = { id: "google-oauth2|2", apelido: "bia", papel: "ADMIN", status: "BLOQUEADO", motivoBloqueio: "Trapaça <x>" };
  const excluido = { id: "auth0|3", papel: "JOGADOR", status: "EXCLUIDO" };

  it("ações permitidas por usuário", () => {
    expect(acoesUsuario(eu, eu.id)).toEqual({ proprio: true, bloquear: false, desbloquear: false, tornarAdmin: false, tornarJogador: false });
    expect(acoesUsuario(ativo, eu.id)).toMatchObject({ bloquear: true, desbloquear: false, tornarAdmin: true, tornarJogador: false });
    expect(acoesUsuario(bloqueado, eu.id)).toMatchObject({ bloquear: false, desbloquear: true, tornarAdmin: false, tornarJogador: true });
    expect(acoesUsuario(excluido, eu.id)).toMatchObject({ bloquear: false, desbloquear: false, tornarAdmin: false, tornarJogador: false });
  });

  it("monta as linhas com papel, status, último acesso e botões", () => {
    const html = htmlLinhasUsuarios([eu, ativo, bloqueado, excluido], eu.id, null, TZ);
    expect(html.match(/<tr /g)).toHaveLength(4);
    expect(html).toContain('<span class="selo">você</span>');
    expect(html).toContain('data-acao="bloquear" data-id="auth0|1"');
    expect(html).toContain('data-acao="tornar-admin" data-id="auth0|1"');
    expect(html).toContain('data-acao="desbloquear" data-id="google-oauth2|2"');
    expect(html).toContain('data-acao="tornar-jogador" data-id="google-oauth2|2"');
    expect(html).toContain('title="Trapaça &lt;x&gt;"');
    expect(html).toContain("Administrador");
    expect(html).toContain("Excluído");
    expect(html).toContain("11/10/2026 14:03");
    expect(html).toContain("<b>ana</b><small>Ana</small>");   // apelido e, embaixo, o nome
  });

  it("desabilita as ações na própria conta", () => {
    const html = htmlLinhasUsuarios([eu], eu.id);
    expect(html).toMatch(/data-acao="bloquear" data-id="auth0\|eu" disabled title="Você não pode alterar a própria conta"/);
    expect(html).toMatch(/data-acao="tornar-jogador" data-id="auth0\|eu" disabled/);
  });

  it("mostra o campo de motivo na linha que está sendo bloqueada", () => {
    const html = htmlLinhasUsuarios([ativo], eu.id, ativo.id);
    expect(html).toContain('data-acao="confirmar-bloqueio" data-id="auth0|1"');
    expect(html).toContain('name="motivo"');
    expect(html).toContain('data-acao="cancelar-bloqueio"');
  });

  it("escapa dados do usuário", () => {
    const html = htmlLinhasUsuarios([{ id: 'x"><script>', apelido: "<i>", email: "<e>", papel: "JOGADOR", status: "ATIVO" }], "eu");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<i>");
    expect(html).toContain("&lt;e&gt;");
  });

  it("lista vazia", () => {
    expect(htmlLinhasUsuarios([], "eu")).toContain("Nenhum usuário encontrado");
    expect(htmlLinhasUsuarios(undefined, "eu")).toContain("Nenhum usuário encontrado");
  });

  it("paginação", () => {
    expect(paginacao({ total: 45, pagina: 0, tamanho: 20 })).toEqual({ texto: "Página 1 de 3 · 45 usuários", anterior: false, proxima: true });
    expect(paginacao({ total: 45, pagina: 2, tamanho: 20 })).toEqual({ texto: "Página 3 de 3 · 45 usuários", anterior: true, proxima: false });
    expect(paginacao({ total: 1 }).texto).toBe("Página 1 de 1 · 1 usuário");
    expect(paginacao().texto).toBe("Página 1 de 1 · 0 usuários");
  });
});
