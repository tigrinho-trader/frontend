import { useState } from "react";

/** Identificacao provisoria: o nome vira o X-Usuario-Id ate o login do Auth0 entrar (Etapa 3). */
export default function Entrada({ aoEntrar }) {
  const [nome, setNome] = useState("");
  const valido = /^[A-Za-z0-9_.-]{3,30}$/.test(nome);

  return (
    <div className="entrada">
      <form
        className="cartao-entrada"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) aoEntrar(nome.toLowerCase());
        }}
      >
        <div className="logo-grande">🐯</div>
        <h1>Tigrinho Trader</h1>
        <p>Jogos de reflexo e coragem movidos pelo preço real das criptos.</p>
        <label htmlFor="nome">Seu nome de jogador</label>
        <input
          id="nome"
          autoFocus
          placeholder="ex.: oscar"
          value={nome}
          onChange={(e) => setNome(e.target.value.trim())}
          maxLength={30}
        />
        <small>3 a 30 letras, números, ponto, hífen ou _. Quem é novo ganha 1.000 moedas.</small>
        <button className="botao-principal" disabled={!valido}>
          Entrar
        </button>
        <p className="nota">Moedas fictícias, sem dinheiro real.</p>
      </form>
    </div>
  );
}
