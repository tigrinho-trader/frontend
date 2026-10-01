import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { faixaPermitida, multiplicador, volatilidade } from "../barreira.js";
import { useRodada } from "../ganchos.js";
import { formatarMoedas, formatarPreco, nomeAtivo } from "../jogo.js";
import { tocar } from "../som.js";
import { criarCena, criarEstado } from "./voo/cena.js";

const APOSTAS = [5, 10, 25, 50, 100];
const DURACOES = [15, 30, 60];
// o gelo chega "do nada" entre 3,5s e 8s depois da decolagem
const GELO_MIN_MS = 3500;
const GELO_MAX_MS = 8000;

export default function VooCongelado({ usuario, cotacoes, historico, parametros, saldo, aoApostar, aoTerminarRodada }) {
  const canvasRef = useRef(null);
  const estado = useRef(criarEstado()).current;
  const [simbolo, setSimbolo] = useState(cotacoes[0].simbolo);
  const [valor, setValor] = useState(10);
  const [duracao, setDuracao] = useState(15);
  const [fase, setFase] = useState("hangar");
  const [ordemId, setOrdemId] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const temporizadores = useRef([]);

  const sigma = volatilidade(parametros, simbolo);

  useEffect(() => criarCena(canvasRef.current, estado), [estado]);
  useEffect(() => () => temporizadores.current.forEach(clearTimeout), []);

  // a cena le os precos e a escala do ativo/duracao escolhidos
  useEffect(() => {
    estado.pontos = historico[simbolo] || [];
  }, [historico, simbolo, estado]);
  useEffect(() => {
    if (estado.fase !== "hangar") return;
    const faixa = faixaPermitida(sigma, duracao, parametros);
    Object.assign(estado, { sigma, duracao, parametros, faixa, escala: faixa.maxima * 1.15, centro: null });
  }, [sigma, duracao, parametros, simbolo, estado]);

  const mudarFase = (nova) => {
    estado.fase = nova;
    setFase(nova);
  };

  const depois = (ms, fn) => temporizadores.current.push(setTimeout(fn, ms));

  const decolar = () => {
    setErro(null);
    setResultado(null);
    setOrdemId(null);
    estado.multiplicadorConfirmado = null;
    estado.geada = 0;
    mudarFase("voo");
    tocar("decolar");

    const inicio = Date.now();
    const geloEm = GELO_MIN_MS + Math.random() * (GELO_MAX_MS - GELO_MIN_MS);
    const geada = setInterval(() => {
      // a geada cresce ate o limite maximo, sem entregar o momento exato do gelo
      estado.geada = Math.min(0.6, ((Date.now() - inicio) / GELO_MAX_MS) * 0.6);
    }, 100);
    temporizadores.current.push(geada);
    depois(geloEm, () => {
      clearInterval(geada);
      congelar();
    });
  };

  const congelar = async () => {
    const pontos = estado.pontos;
    const preco = pontos[pontos.length - 1]?.preco;
    if (!preco) {
      mudarFase("hangar");
      setErro("Sem preço agora, tente de novo.");
      return;
    }
    const alvo = preco * Math.exp(estado.distancia);
    Object.assign(estado, {
      alvo,
      centro: preco,
      inicioGelo: Date.now(),
      congeladoEm: performance.now(),
      expiraEm: Date.now() + duracao * 1000,
    });
    mudarFase("congelado");
    tocar("congelar");
    try {
      const ordem = await api.apostar(usuario, {
        simbolo,
        tipo: "BARREIRA",
        alvo: Number(alvo.toFixed(8)),
        valor,
        duracaoSegundos: duracao,
      });
      estado.multiplicadorConfirmado = Number(ordem.multiplicador);
      estado.alvo = Number(ordem.alvo);
      estado.expiraEm = Date.now() + (new Date(ordem.expiraEm) - new Date(ordem.criadaEm));
      setOrdemId(ordem.id);
      aoApostar();
    } catch (e) {
      // aposta recusada: nada foi cobrado, o aviao descongela
      setErro(e.message);
      mudarFase("hangar");
    }
  };

  useRodada(usuario, ordemId, (ordem) => {
    setResultado(ordem);
    aoTerminarRodada();
    if (ordem.status === "PERDEU") {
      mudarFase("atingido");
      tocar("impacto");
      depois(500, () => tocar("derrota"));
    } else {
      mudarFase("livre");
      tocar("vitoria");
      depois(350, () => tocar("moeda"));
    }
  });

  const preco = historico[simbolo]?.at(-1)?.preco;
  const previa = multiplicador(faixaPermitida(sigma, duracao, parametros).minima * 6, sigma, duracao, parametros);

  return (
    <div className="voo">
      <div className="voo-palco">
        <canvas ref={canvasRef} className="voo-canvas" aria-label="Céu do Voo Congelado" />

        <div className="hud">
          <span className="hud-item">
            {nomeAtivo(simbolo)} <strong>{preco ? formatarPreco(preco) : "…"}</strong>
          </span>
          <span className="hud-item">
            🪙 {formatarMoedas(valor)} · ⏱ {duracao}s
          </span>
        </div>

        {fase === "voo" && <div className="aviso-voo">Escolha sua altura… o gelo pode chegar a qualquer momento ❄️</div>}
        {fase === "congelado" && (
          <div className="aviso-voo gelado">
            ❄️ Congelou! Se a linha do preço encostar no avião, ele cai.
            {estado.multiplicadorConfirmado && (
              <> Prêmio se sobreviver: <strong>{formatarMoedas(valor * estado.multiplicadorConfirmado)}</strong></>
            )}
          </div>
        )}

        {fase === "hangar" && (
          <div className="painel-voo">
            <h3>✈️ Voo Congelado</h3>
            <p>
              Mova o mouse, arraste o dedo ou use ↑ ↓ para escolher a altura. Do nada chega o gelo e o avião congela
              onde estiver. Até o gelo derreter, <strong>a linha do preço não pode encostar nele</strong>. Perto da
              linha paga até {formatarMoedas(parametros.multiplicadorMaximo)}x; longe é seguro e paga pouco.
            </p>
            <div className="escolhas">
              <div>
                <span className="rotulo">Céu</span>
                <div className="opcoes">
                  {cotacoes.map((c) => (
                    <button
                      key={c.simbolo}
                      className={`opcao ${c.simbolo === simbolo ? "ativa" : ""}`}
                      onClick={() => setSimbolo(c.simbolo)}
                    >
                      {nomeAtivo(c.simbolo)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="rotulo">Aposta</span>
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
              <div>
                <span className="rotulo">Gelo dura</span>
                <div className="opcoes">
                  {DURACOES.map((d) => (
                    <button key={d} className={`opcao ${d === duracao ? "ativa" : ""}`} onClick={() => setDuracao(d)}>
                      {d}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button className="botao-principal" disabled={valor > saldo || !preco} onClick={decolar}>
              Decolar ✈️
            </button>
            <small className="dica">Ex.: num ponto médio da tela esta rodada paga uns {formatarMoedas(previa)}x.</small>
            {erro && <p className="aviso erro">{erro}</p>}
          </div>
        )}

        {resultado && (fase === "atingido" || fase === "livre") && (
          <div className={`resultado-voo ${fase}`}>
            <div className="resultado-titulo">{fase === "livre" ? "Sobreviveu! 🎉" : "Atingido! 💥"}</div>
            <div className="resultado-valor">
              {Number(resultado.valorLiquido) > 0 ? "+" : ""}
              {formatarMoedas(resultado.valorLiquido)} moedas
              {fase === "livre" && <small> ({formatarMoedas(resultado.multiplicador)}x)</small>}
            </div>
            <button className="botao-principal" onClick={() => mudarFase("hangar")}>
              Voar de novo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
