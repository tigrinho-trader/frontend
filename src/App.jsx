import { useEffect, useState } from "react";
import { api } from "./api.js";
import { useArmazenado, useCotacoes, useJogador } from "./ganchos.js";
import { FICHAS } from "./jogo.js";
import Entrada from "./componentes/Entrada.jsx";
import Topo from "./componentes/Topo.jsx";
import Ticker from "./componentes/Ticker.jsx";
import Controles from "./componentes/Controles.jsx";
import Historico from "./componentes/Historico.jsx";
import Palpite from "./jogos/Palpite.jsx";
import Roleta from "./jogos/Roleta.jsx";
import Escada from "./jogos/Escada.jsx";

const JOGOS = [
  { id: "palpite", nome: "Palpite", emoji: "🎯", descricao: "Escolha o ativo e diga se sobe, desce ou fica parado." },
  { id: "roleta", nome: "Roleta do Tigre", emoji: "🎡", descricao: "A roleta escolhe o ativo e o palpite. Só a sorte." },
  { id: "escada", nome: "Escada", emoji: "🪜", descricao: "Cada acerto vira a próxima aposta. Suba 5 degraus ou saque antes." },
];

export default function App() {
  const [usuario, setUsuario] = useArmazenado("tigrinho.usuario", null);
  if (!usuario) return <Entrada aoEntrar={setUsuario} />;
  return <Mesa usuario={usuario} aoSair={() => setUsuario(null)} />;
}

function Mesa({ usuario, aoSair }) {
  const { cotacoes, historico, erro: erroCotacoes } = useCotacoes();
  const { carteira, ordens, atualizar } = useJogador(usuario);
  const [regras, setRegras] = useState(null);
  const [erroRegras, setErroRegras] = useState(null);
  const [jogo, setJogo] = useArmazenado("tigrinho.jogo", "palpite");
  const [modo, setModo] = useArmazenado("tigrinho.modo", "DIFICIL");
  const [valor, setValor] = useArmazenado("tigrinho.valor", FICHAS[1]);
  const [duracao, setDuracao] = useArmazenado("tigrinho.duracao", 15);

  useEffect(() => {
    api.regras().then(setRegras).catch((e) => setErroRegras(e.message));
  }, []);

  useEffect(() => {
    document.body.dataset.modo = modo;
  }, [modo]);

  const regraModo = regras?.modos.find((m) => m.modo === modo);

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
    regras,
    regraModo,
    modo,
    valor: Number(valor),
    duracao,
    cotacoes,
    historico,
    saldo: carteira ? Number(carteira.saldo) : 0,
    aoApostar: atualizar,
    aoTerminarRodada,
  };

  const jogoAtual = JOGOS.find((j) => j.id === jogo) || JOGOS[0];

  return (
    <div className="mesa">
      <Topo usuario={usuario} carteira={carteira} aoSair={aoSair} aoRecarregar={recarregar} />
      <Ticker cotacoes={cotacoes} historico={historico} erro={erroCotacoes} />

      <main className="conteudo">
        <section className="palco">
          <nav className="abas" aria-label="Jogos">
            {JOGOS.map((j) => (
              <button
                key={j.id}
                className={`aba ${j.id === jogoAtual.id ? "ativa" : ""}`}
                onClick={() => setJogo(j.id)}
              >
                <span className="aba-emoji">{j.emoji}</span> {j.nome}
              </button>
            ))}
          </nav>
          <p className="descricao-jogo">{jogoAtual.descricao}</p>

          <Controles
            regras={regras}
            modo={modo}
            aoMudarModo={setModo}
            valor={Number(valor)}
            aoMudarValor={setValor}
            duracao={duracao}
            aoMudarDuracao={setDuracao}
            saldo={contexto.saldo}
          />

          {erroRegras && <p className="aviso erro">Não consegui carregar as regras: {erroRegras}</p>}

          {regras && cotacoes.length > 0 ? (
            <div className="area-jogo" key={jogoAtual.id}>
              {jogoAtual.id === "palpite" && <Palpite {...contexto} />}
              {jogoAtual.id === "roleta" && <Roleta {...contexto} />}
              {jogoAtual.id === "escada" && <Escada {...contexto} />}
            </div>
          ) : (
            <p className="aviso">Esperando as cotações da Binance…</p>
          )}
        </section>

        <Historico ordens={ordens} />
      </main>

      <footer className="rodape">
        Fichas fictícias, sem dinheiro real · preços reais da Binance · projeto acadêmico Insper
      </footer>
    </div>
  );
}
