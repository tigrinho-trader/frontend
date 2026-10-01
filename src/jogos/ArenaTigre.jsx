import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { volatilidade } from "../barreira.js";
import { useAgora } from "../ganchos.js";
import { formatarMoedas, formatarPreco, nomeAtivo } from "../jogo.js";
import { tocar } from "../som.js";
import { progressoDoTigre } from "../tigre.js";
import {
  DURACAO_COMBATE,
  ONDAS,
  SEGUNDOS_ESCOLHA,
  alvoDoAnimal,
  distanciaDoAnimal,
  premioDoAnimal,
  sortearOnda,
} from "./arena/bestiario.js";

const APOSTAS = [5, 10, 25, 50];
const TERRENOS = { BTCUSDT: "Savana do Bitcoin", ETHUSDT: "Selva do Ether", SOLUSDT: "Deserto do Solana" };
const X_INICIO = 6;
const X_FIM = 86;

export default function ArenaTigre({ usuario, cotacoes, historico, parametros, saldo, ordens, aoApostar,
                                     aoTerminarRodada }) {
  const [simbolo, setSimbolo] = useState(cotacoes[0].simbolo);
  const [valor, setValor] = useState(10);
  const [fase, setFase] = useState("acampamento"); // acampamento | escolha | combate | intervalo | fim
  const [onda, setOnda] = useState(0);
  const [desafiantes, setDesafiantes] = useState([]);
  const [escolhidos, setEscolhidos] = useState([]);
  const [prazoEscolha, setPrazoEscolha] = useState(0);
  const [combates, setCombates] = useState([]);
  const [arena, setArena] = useState(null); // { centro, escala, inicio, fim }
  const [relatorio, setRelatorio] = useState([]);
  const [aviso, setAviso] = useState(null);
  const progressoInicial = useRef(null);
  const temporizadores = useRef([]);
  const agora = useAgora(fase === "escolha" || fase === "combate");

  const sigma = volatilidade(parametros, simbolo);
  const pontos = historico[simbolo] || [];
  const preco = pontos.at(-1)?.preco;
  const progresso = useMemo(() => progressoDoTigre(ordens), [ordens]);

  useEffect(() => () => temporizadores.current.forEach(clearTimeout), []);
  const depois = (ms, fn) => temporizadores.current.push(setTimeout(fn, ms));

  // ---------- fluxo da expedicao ----------
  const comecarExpedicao = () => {
    progressoInicial.current = progresso;
    setRelatorio([]);
    tocar("rugido");
    proximaOnda(1);
  };

  const proximaOnda = (numero) => {
    if (numero > ONDAS) {
      setFase("fim");
      return;
    }
    setOnda(numero);
    setDesafiantes(sortearOnda(numero));
    setEscolhidos([]);
    setCombates([]);
    setAviso(null);
    setPrazoEscolha(Date.now() + SEGUNDOS_ESCOLHA * 1000);
    setFase("escolha");
  };

  const alternar = (chave) => {
    tocar("clique");
    setEscolhidos((atual) => (atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave]));
  };

  // fim do tempo de escolha
  useEffect(() => {
    if (fase === "escolha" && agora >= prazoEscolha) lutar();
  }, [fase, agora, prazoEscolha]); // eslint-disable-line react-hooks/exhaustive-deps

  const lutar = async () => {
    if (fase !== "escolha") return;
    const lutadores = desafiantes.filter((a) => escolhidos.includes(a.chave));
    if (lutadores.length === 0 || !preco) {
      setRelatorio((r) => [...r, { onda, descansou: true }]);
      setAviso("O tigre descansou nesta onda 💤");
      setFase("intervalo");
      depois(1800, () => proximaOnda(onda + 1));
      return;
    }
    setFase("combate");
    const centro = preco;
    const escala = Math.max(...lutadores.map((a) => distanciaDoAnimal(a, sigma, parametros))) * 1.45;
    setArena({ centro, escala, inicio: Date.now(), fim: Date.now() + DURACAO_COMBATE * 1000 });
    tocar("rugido");

    const abertos = [];
    // uma por vez: o trading-service confere o saldo livre a cada aposta
    for (const animal of lutadores) {
      const alvo = alvoDoAnimal(animal, centro, sigma, parametros);
      try {
        const ordem = await api.apostar(usuario, {
          simbolo,
          tipo: "BARREIRA",
          alvo: Number(alvo.toFixed(8)),
          valor,
          duracaoSegundos: DURACAO_COMBATE,
        });
        abertos.push({ animal, ordem, alvo: Number(ordem.alvo), efeito: null });
      } catch (e) {
        setAviso(`${animal.emoji} ${animal.nome} fugiu: ${e.message}`);
      }
    }
    aoApostar();
    if (abertos.length === 0) {
      setFase("intervalo");
      depois(2000, () => proximaOnda(onda + 1));
      return;
    }
    setCombates(abertos);
  };

  // acompanha as rodadas da onda
  useEffect(() => {
    if (fase !== "combate" || combates.length === 0) return undefined;
    let vivo = true;
    const consultar = async () => {
      const atualizados = await Promise.all(
        combates.map(async (c) => {
          if (c.ordem.status !== "ABERTA") return c;
          try {
            const ordem = await api.ordem(usuario, c.ordem.id);
            if (ordem.status === "ABERTA") return c;
            if (ordem.status === "PERDEU") tocar("golpe");
            else tocar("moeda");
            return { ...c, ordem, efeito: ordem.status === "PERDEU" ? "ataque" : "nocaute" };
          } catch {
            return c;
          }
        }),
      );
      if (!vivo) return;
      setCombates(atualizados);
      if (atualizados.every((c) => c.ordem.status !== "ABERTA")) {
        aoTerminarRodada();
        setRelatorio((r) => [...r, { onda, combates: atualizados }]);
        const liquido = atualizados.reduce((s, c) => s + Number(c.ordem.valorLiquido), 0);
        if (liquido > 0) tocar("vitoria");
        else tocar("derrota");
        setFase("intervalo");
        depois(2600, () => proximaOnda(onda + 1));
      }
    };
    const t = setInterval(consultar, 1000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [fase, combates, onda]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- desenho do campo ----------
  const campo = fase === "combate" || fase === "intervalo" ? arena : preco ? { centro: preco, escala: null } : null;
  const escalaPrevia = Math.max(...desafiantes.map((a) => distanciaDoAnimal(a, sigma, parametros)), 0.0001) * 1.45;
  const escala = campo?.escala || escalaPrevia;
  const topo = (p) => 50 - (Math.log(p / campo.centro) / escala) * 44;

  const progressoCombate = arena ? Math.min(1, Math.max(0, (agora - arena.inicio) / (arena.fim - arena.inicio))) : 0;
  const tigreX = fase === "combate" || fase === "intervalo" ? X_INICIO + (X_FIM - X_INICIO) * progressoCombate : X_INICIO;
  const tigreY = campo && preco ? Math.max(3, Math.min(97, topo(preco))) : 50;

  const trilha = useMemo(() => {
    if (!arena || (fase !== "combate" && fase !== "intervalo")) return "";
    return pontos
      .filter((p) => (p.recebido || 0) >= arena.inicio - 1000 && (p.recebido || 0) <= arena.fim + 500)
      .map((p) => {
        const t = Math.min(1, Math.max(0, ((p.recebido || 0) - arena.inicio) / (arena.fim - arena.inicio)));
        const x = X_INICIO + (X_FIM - X_INICIO) * t;
        return `${x},${Math.max(0, Math.min(100, topo(p.preco)))}`;
      })
      .join(" ");
  }, [pontos, arena, fase]); // eslint-disable-line react-hooks/exhaustive-deps

  const linhas =
    fase === "escolha"
      ? desafiantes.map((animal) => ({
          animal,
          y: topo(alvoDoAnimal(animal, campo?.centro || 1, sigma, parametros)),
          ativo: escolhidos.includes(animal.chave),
          efeito: null,
        }))
      : combates.map((c) => ({ animal: c.animal, y: topo(c.alvo), ativo: true, efeito: c.efeito }));

  const golpeado = combates.some((c) => c.efeito === "ataque");
  const resumoOnda = relatorio.at(-1);
  const totalExpedicao = relatorio
    .flatMap((r) => r.combates || [])
    .reduce((s, c) => s + Number(c.ordem.valorLiquido), 0);

  return (
    <div className="arena">
      <div className={`arena-campo ${golpeado && fase === "intervalo" ? "tremendo" : ""}`}>
        <div className="arena-ceu" />
        <div className="arena-chao" />

        {campo &&
          linhas.map(({ animal, y, ativo, efeito }, i) => {
            const yLimitado = Math.max(4, Math.min(96, y));
            const ataque = efeito === "ataque";
            return (
              <div key={animal.chave}>
                <div
                  className={`linha-ataque ${animal.lado === 1 ? "do-ceu" : "do-chao"} ${ativo ? "ativa" : ""} ${efeito || ""}`}
                  style={{ top: `${yLimitado}%` }}
                />
                <div
                  className={`animal ${ativo ? "ativo" : ""} ${efeito || ""}`}
                  style={{
                    top: `${ataque ? tigreY : yLimitado}%`,
                    left: `${ataque ? tigreX + 3 : 92 - (i % 2) * 5}%`,
                  }}
                  title={animal.nome}
                >
                  <span className="animal-emoji">{animal.emoji}</span>
                  {efeito === "nocaute" && <span className="balao ko">KO!</span>}
                  {ataque && <span className="balao pow">POW!</span>}
                </div>
              </div>
            );
          })}

        {trilha && (
          <svg className="trilha" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={trilha} />
          </svg>
        )}

        {campo && (
          <div
            className={`tigre ${golpeado ? "ferido" : ""} ${fase === "combate" ? "correndo" : ""}`}
            style={{ left: `${tigreX}%`, top: `${tigreY}%` }}
          >
            🐯
          </div>
        )}

        <div className="hud">
          <span className="hud-item">
            {TERRENOS[simbolo] || nomeAtivo(simbolo)} · <strong>{preco ? formatarPreco(preco) : "…"}</strong>
          </span>
          {onda > 0 && fase !== "fim" && (
            <span className="hud-item">
              Onda {onda}/{ONDAS} · {formatarMoedas(totalExpedicao)} moedas
            </span>
          )}
        </div>

        {fase === "combate" && (
          <div className="aviso-voo">
            ⏱ {Math.max(0, Math.ceil((arena.fim - agora) / 1000))}s · o tigre não pode cruzar as linhas de ataque!
          </div>
        )}

        {fase === "intervalo" && resumoOnda && (
          <div className="faixa-onda">
            {resumoOnda.descansou
              ? "💤 O tigre descansou"
              : resumoOnda.combates.map((c) => (
                  <span key={c.animal.chave} className={c.ordem.status === "GANHOU" ? "sobe" : "desce"}>
                    {c.animal.emoji} {c.ordem.status === "GANHOU" ? "KO" : "acertou"}{" "}
                    {Number(c.ordem.valorLiquido) > 0 ? "+" : ""}
                    {formatarMoedas(c.ordem.valorLiquido)}
                  </span>
                ))}
          </div>
        )}
      </div>

      {fase === "acampamento" && (
        <div className="painel-arena">
          <h3>🐯 Arena do Tigre</h3>
          <p>
            Uma expedição de 3 minutos em {ONDAS} ondas. Em cada onda aparecem animais: os do céu atacam de cima, os do
            chão de baixo. Escolha quantos e quais enfrentar. Durante 30s o tigre atravessa a arena na altura do preço
            real: <strong>se ele cruzar a linha de um animal, leva o golpe</strong> e perde a aposta; se chegar ao fim
            sem cruzar, o animal vai a nocaute e você leva o prêmio. Bicho forte fica mais perto e paga mais.
          </p>
          <div className="escolhas">
            <div>
              <span className="rotulo">Terreno</span>
              <div className="opcoes">
                {cotacoes.map((c) => (
                  <button
                    key={c.simbolo}
                    className={`opcao ${c.simbolo === simbolo ? "ativa" : ""}`}
                    onClick={() => setSimbolo(c.simbolo)}
                  >
                    {TERRENOS[c.simbolo] || nomeAtivo(c.simbolo)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="rotulo">Aposta por combate</span>
              <div className="opcoes">
                {APOSTAS.map((a) => (
                  <button
                    key={a}
                    className={`opcao ${a === valor ? "ativa" : ""}`}
                    disabled={a > saldo}
                    onClick={() => setValor(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button className="botao-principal" disabled={!preco || valor > saldo} onClick={comecarExpedicao}>
            Começar expedição
          </button>
        </div>
      )}

      {fase === "escolha" && (
        <div className="painel-arena">
          <div className="escolha-topo">
            <h3>
              Onda {onda} de {ONDAS}: quem o tigre enfrenta?
            </h3>
            <span className="contagem">{Math.max(0, Math.ceil((prazoEscolha - agora) / 1000))}s</span>
          </div>
          <div className="desafiantes">
            {desafiantes.map((animal) => {
              const premio = premioDoAnimal(animal, sigma, parametros);
              const escolhido = escolhidos.includes(animal.chave);
              return (
                <button
                  key={animal.chave}
                  className={`desafiante ${escolhido ? "escolhido" : ""} ${animal.chefe ? "chefe" : ""}`}
                  onClick={() => alternar(animal.chave)}
                >
                  <span className="desafiante-emoji">{animal.emoji}</span>
                  <span className="desafiante-nome">
                    {animal.nome} {animal.chefe && "👑"}
                  </span>
                  <span className="desafiante-lado">{animal.lado === 1 ? "ataca de cima ↓" : "ataca de baixo ↑"}</span>
                  <span className="forca" aria-label={`Força ${animal.nivel} de 4`}>
                    {"🔥".repeat(animal.nivel)}
                    <span className="forca-vazia">{"🔥".repeat(4 - animal.nivel)}</span>
                  </span>
                  <span className="desafiante-premio">
                    {formatarMoedas(valor)} → {formatarMoedas(valor * premio)}
                  </span>
                  <span className="desafiante-chance">{Math.round(animal.chance * 100)}% de sair ileso</span>
                </button>
              );
            })}
          </div>
          <div className="escolha-rodape">
            <span>
              {escolhidos.length} combate(s) · arriscando {formatarMoedas(valor * escolhidos.length)} moedas
            </span>
            <button
              className="botao-principal"
              disabled={valor * escolhidos.length > saldo}
              onClick={lutar}
            >
              {escolhidos.length ? "Lutar!" : "Descansar esta onda"}
            </button>
          </div>
          {aviso && <p className="aviso erro">{aviso}</p>}
        </div>
      )}

      {(fase === "combate" || fase === "intervalo") && aviso && <p className="aviso erro">{aviso}</p>}

      {fase === "fim" && (
        <FimDaExpedicao
          relatorio={relatorio}
          antes={progressoInicial.current}
          depois={progresso}
          aoRecomecar={() => setFase("acampamento")}
        />
      )}
    </div>
  );
}

function FimDaExpedicao({ relatorio, antes, depois, aoRecomecar }) {
  const combates = relatorio.flatMap((r) => r.combates || []);
  const vencidos = combates.filter((c) => c.ordem.status === "GANHOU");
  const sofridos = combates.filter((c) => c.ordem.status === "PERDEU");
  const total = combates.reduce((s, c) => s + Number(c.ordem.valorLiquido), 0);
  const subiu = antes && depois.nivel > antes.nivel;

  useEffect(() => {
    tocar(total >= 0 ? "vitoria" : "derrota");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="painel-arena fim-expedicao">
      <h3>{total >= 0 ? "Expedição vitoriosa! 🏆" : "Expedição difícil 🩹"}</h3>
      <p className={`total ${total >= 0 ? "sobe" : "desce"}`}>
        {total > 0 ? "+" : ""}
        {formatarMoedas(total)} moedas
      </p>
      <div className="placar-expedicao">
        <div>
          <span className="rotulo">Nocautes</span>
          <span className="emojis">{vencidos.map((c) => c.animal.emoji).join(" ") || "—"}</span>
        </div>
        <div>
          <span className="rotulo">Golpes sofridos</span>
          <span className="emojis">{sofridos.map((c) => c.animal.emoji).join(" ") || "nenhum 💪"}</span>
        </div>
        <div>
          <span className="rotulo">XP do tigre</span>
          <span>
            +{antes ? depois.xp - antes.xp : 0} XP · nível {depois.nivel} ({depois.titulo})
          </span>
        </div>
      </div>
      {subiu && <p className="subiu-nivel">⬆️ Seu tigre subiu para o nível {depois.nivel}!</p>}
      <button className="botao-principal" onClick={aoRecomecar}>
        Nova expedição
      </button>
    </div>
  );
}
