import { useMemo } from "react";
import { api } from "./api.js";
import { useArmazenado, useCotacoes, useJogador, useParametrosBarreira } from "./ganchos.js";
import { progressoDoTigre, TROFEUS } from "./tigre.js";
import { tocar } from "./som.js";
import Entrada from "./componentes/Entrada.jsx";
import Topo from "./componentes/Topo.jsx";
import Ticker from "./componentes/Ticker.jsx";
import Historico from "./componentes/Historico.jsx";
import VooCongelado from "./jogos/VooCongelado.jsx";
import ArenaTigre from "./jogos/ArenaTigre.jsx";

const JOGOS = [
  {
    id: "voo",
    nome: "Voo Congelado",
    emoji: "✈️",
    cena: "❄️",
    descricao: "Pilote o avião sobre o gráfico. Do nada, o gelo congela você no ar: se o preço encostar, você cai.",
    cor: "ceu",
  },
  {
    id: "arena",
    nome: "Arena do Tigre",
    emoji: "🐯",
    cena: "🦅🐊",
    descricao: "Expedição de 3 minutos: escolha quais animais enfrentar. Bicho forte paga mais e acerta mais fácil.",
    cor: "selva",
  },
];

export default function App() {
  const [usuario, setUsuario] = useArmazenado("tigrinho.usuario", null);
  if (!usuario) return <Entrada aoEntrar={setUsuario} />;
  return <Mesa usuario={usuario} aoSair={() => setUsuario(null)} />;
}

function Mesa({ usuario, aoSair }) {
  const { cotacoes, historico, erro: erroCotacoes } = useCotacoes();
  const { carteira, ordens, atualizar } = useJogador(usuario);
  const parametros = useParametrosBarreira();
  const [jogo, setJogo] = useArmazenado("tigrinho.jogo", null);
  const progresso = useMemo(() => progressoDoTigre(ordens), [ordens]);

  // a carteira recebe o resultado pelo RabbitMQ: confere de novo um pouco depois
  const aoTerminarRodada = () => {
    atualizar();
    setTimeout(atualizar, 1500);
  };

  const recarregar = async () => {
    await api.depositar(usuario, 1000);
    atualizar();
  };

  const contexto = {
    usuario,
    cotacoes,
    historico,
    parametros,
    ordens,
    saldo: carteira ? Number(carteira.saldo) : 0,
    aoApostar: atualizar,
    aoTerminarRodada,
  };

  const jogoAtual = JOGOS.find((j) => j.id === jogo);
  const pronto = cotacoes.length > 0;

  return (
    <div className="mesa">
      <Topo
        usuario={usuario}
        carteira={carteira}
        progresso={progresso}
        aoSair={aoSair}
        aoRecarregar={recarregar}
        aoInicio={() => setJogo(null)}
      />
      <Ticker cotacoes={cotacoes} historico={historico} erro={erroCotacoes} />

      {!jogoAtual ? (
        <main className="lobby">
          <section className="jogos">
            {JOGOS.map((j) => (
              <button
                key={j.id}
                className={`cartao-jogo cartao-${j.cor}`}
                onClick={() => {
                  tocar("clique");
                  setJogo(j.id);
                }}
              >
                <span className="cartao-arte" aria-hidden="true">
                  <span className="cartao-emoji">{j.emoji}</span>
                  <span className="cartao-cena">{j.cena}</span>
                </span>
                <span className="cartao-nome">{j.nome}</span>
                <span className="cartao-descricao">{j.descricao}</span>
                <span className="cartao-jogar">Jogar →</span>
              </button>
            ))}
          </section>
          <Covil progresso={progresso} />
          <Historico ordens={ordens} />
        </main>
      ) : (
        <main className="tela-jogo">
          <button className="voltar" onClick={() => setJogo(null)}>
            ← Jogos
          </button>
          {pronto ? (
            jogoAtual.id === "voo" ? (
              <VooCongelado {...contexto} />
            ) : (
              <ArenaTigre {...contexto} />
            )
          ) : (
            <p className="aviso">Esperando as cotações da Binance…</p>
          )}
        </main>
      )}

      <footer className="rodape">Moedas fictícias, sem dinheiro real · preços reais da Binance · projeto acadêmico Insper</footer>
    </div>
  );
}

/** O tigre do jogador: nivel, XP e trofeus, guardados no historico do servidor. */
function Covil({ progresso }) {
  return (
    <section className="covil">
      <div className="covil-tigre" aria-hidden="true">
        🐯
      </div>
      <div className="covil-info">
        <h2>
          Seu tigre · nível {progresso.nivel} <small>{progresso.titulo}</small>
        </h2>
        <div className="barra-xp" title={`${progresso.xp} XP`}>
          <div className="barra-xp-cheia" style={{ width: `${progresso.progresso * 100}%` }} />
        </div>
        <small>
          {progresso.xp} XP · faltam {progresso.faltam} para o nível {progresso.nivel + 1}
        </small>
        <div className="trofeus">
          {TROFEUS.map((t) => (
            <span key={t.id} className={`trofeu ${progresso.trofeus[t.id] ? "" : "apagado"}`} title={t.nome}>
              {t.emoji} {progresso.trofeus[t.id]}
            </span>
          ))}
          <span className="trofeu">
            ⚔️ {progresso.vitorias}V / {progresso.derrotas}D
          </span>
        </div>
      </div>
    </section>
  );
}
