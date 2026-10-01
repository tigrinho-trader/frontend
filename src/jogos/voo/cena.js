// Cena do Voo Congelado desenhada em canvas. Nao conhece React nem a API: le e escreve no objeto `estado`
// que o componente compartilha com ela.
//
// Eixo vertical = preco (em log, relativo ao "centro"); eixo horizontal = tempo, com o "agora" fixo em CABECA_X.
// Voando, a camera segue o preco e a altura do aviao e a distancia dele ate o preco atual. Congelado, a camera
// para e o aviao vira uma barreira: se a linha do preco encostar na altura dele, ele e atingido.

import { multiplicador } from "../../barreira.js";

const CABECA_X = 0.6; // fracao da largura onde fica o "agora"
const AVIAO_X = 0.74;
const SEGUNDOS_VISIVEIS = 45;
const AREA_UTIL = 0.86; // fracao da meia altura usada pela escala

export function criarEstado() {
  return {
    fase: "hangar", // hangar | voo | congelado | atingido | livre
    pontos: [],
    sigma: 0.00008,
    duracao: 15,
    parametros: null,
    escala: 0.001, // distancia em log que ocupa a meia altura
    faixa: { minima: 0.00002, maxima: 0.0008 },
    centro: null,
    alvoY: 0, // -1 (base) .. 1 (topo), comandado pelo jogador
    distancia: 0.0003, // distancia assinada (log) do aviao ate o preco: + acima, - abaixo
    alvo: null, // preco congelado
    multiplicadorConfirmado: null,
    congeladoEm: 0, // performance.now() do congelamento (animacao do bloco)
    inicioGelo: 0, // Date.now() do congelamento (anel do tempo)
    expiraEm: 0,
    resultadoEm: 0,
    geada: 0, // 0..1, vinheta de gelo chegando
  };
}

export function criarCena(canvas, estado) {
  const ctx = canvas.getContext("2d");
  let largura = 0;
  let altura = 0;
  let quadro = 0;
  let ultimo = performance.now();
  let tremor = 0;
  const particulas = [];
  const nuvens = Array.from({ length: 9 }, (_, i) => ({
    x: Math.random(),
    y: 0.08 + Math.random() * 0.84,
    tamanho: 30 + Math.random() * 50,
    velocidade: 0.008 + Math.random() * 0.02,
    camada: i % 3,
  }));
  const aviao = { y: 0, inclinacao: 0, queda: 0, giro: 0, saida: 0 };

  function redimensionar() {
    const dpr = window.devicePixelRatio || 1;
    const caixa = canvas.getBoundingClientRect();
    largura = caixa.width;
    altura = caixa.height;
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const observador = new ResizeObserver(redimensionar);
  observador.observe(canvas);
  redimensionar();

  // ---------- controles ----------
  function apontar(clienteY) {
    const caixa = canvas.getBoundingClientRect();
    estado.alvoY = Math.max(-1, Math.min(1, 1 - ((clienteY - caixa.top) / caixa.height) * 2));
  }
  const aoMover = (e) => apontar(e.clientY);
  const aoTocar = (e) => {
    if (e.touches[0]) apontar(e.touches[0].clientY);
    if (estado.fase === "voo") e.preventDefault();
  };
  const teclas = new Set();
  const aoTeclar = (e) => {
    if (["ArrowUp", "ArrowDown", "w", "s", "W", "S"].includes(e.key)) {
      teclas.add(e.key.toLowerCase());
      if (estado.fase === "voo") e.preventDefault();
    }
  };
  const aoSoltar = (e) => teclas.delete(e.key.toLowerCase());
  canvas.addEventListener("pointermove", aoMover);
  canvas.addEventListener("touchmove", aoTocar, { passive: false });
  window.addEventListener("keydown", aoTeclar);
  window.addEventListener("keyup", aoSoltar);

  // ---------- conversoes ----------
  const meiaAltura = () => (altura / 2) * AREA_UTIL;
  const yDoLog = (logRelativo) => altura / 2 - (logRelativo / estado.escala) * meiaAltura();
  const yDoPreco = (preco) => yDoLog(Math.log(preco / estado.centro));

  function precoAtual() {
    const p = estado.pontos;
    return p.length ? p[p.length - 1].preco : null;
  }

  // ---------- particulas ----------
  function explodir(x, y, cores, quantidade, forca = 6) {
    for (let i = 0; i < quantidade; i++) {
      const angulo = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * forca;
      particulas.push({
        x,
        y,
        vx: Math.cos(angulo) * v,
        vy: Math.sin(angulo) * v - 2,
        vida: 1,
        decaimento: 0.012 + Math.random() * 0.02,
        cor: cores[i % cores.length],
        tamanho: 3 + Math.random() * 6,
      });
    }
  }
  function moedas(x, y) {
    for (let i = 0; i < 18; i++) {
      particulas.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 9,
        vy: -4 - Math.random() * 6,
        vida: 1,
        decaimento: 0.012,
        texto: "🪙",
        tamanho: 20,
      });
    }
  }

  let faseAnterior = estado.fase;
  function aoMudarFase(nova) {
    const x = largura * AVIAO_X;
    if (nova === "congelado") {
      explodir(x, aviao.y, ["#e0f7ff", "#a5e4ff", "#ffffff"], 40, 5);
    } else if (nova === "atingido") {
      tremor = 18;
      explodir(x, aviao.y, ["#ff6b00", "#ffb703", "#5c5c5c", "#9ad8ff"], 70, 8);
    } else if (nova === "livre") {
      explodir(x, aviao.y, ["#c9f1ff", "#ffffff", "#7fd6ff"], 50, 7);
      moedas(x, aviao.y);
    } else if (nova === "voo" || nova === "hangar") {
      aviao.queda = 0;
      aviao.giro = 0;
      aviao.saida = 0;
    }
  }

  // ---------- simulacao ----------
  function atualizar(dt) {
    if (estado.fase !== faseAnterior) {
      aoMudarFase(estado.fase);
      faseAnterior = estado.fase;
    }
    const preco = precoAtual();
    if (preco && estado.centro == null) estado.centro = preco;

    if (estado.fase === "hangar" || estado.fase === "voo") {
      // camera acompanha o preco
      if (preco) estado.centro += (preco - estado.centro) * Math.min(1, dt * 3);
      if (teclas.has("arrowup") || teclas.has("w")) estado.alvoY = Math.min(1, estado.alvoY + dt * 1.4);
      if (teclas.has("arrowdown") || teclas.has("s")) estado.alvoY = Math.max(-1, estado.alvoY - dt * 1.4);
      // distancia assinada respeitando a faixa aceita pelo backend
      const bruta = estado.alvoY * estado.escala / AREA_UTIL;
      const lado = bruta >= 0 ? 1 : -1;
      const modulo = Math.min(estado.faixa.maxima, Math.max(estado.faixa.minima, Math.abs(bruta)));
      estado.distancia = lado * modulo;
      const yAlvo = preco ? yDoLog(Math.log(preco / estado.centro) + estado.distancia) : altura / 2;
      const anterior = aviao.y || yAlvo;
      aviao.y += (yAlvo - aviao.y) * Math.min(1, dt * 8);
      aviao.inclinacao += ((anterior - aviao.y) * 0.04 - aviao.inclinacao) * Math.min(1, dt * 6);
    } else if (estado.fase === "congelado") {
      aviao.y = yDoPreco(estado.alvo);
      aviao.inclinacao *= 0.9;
    } else if (estado.fase === "atingido") {
      aviao.queda += dt * 520;
      aviao.giro += dt * 7;
      aviao.y += aviao.queda * dt;
    } else if (estado.fase === "livre") {
      aviao.saida += dt;
      aviao.y -= dt * 160 * aviao.saida;
      aviao.inclinacao = Math.min(0.6, aviao.inclinacao + dt);
    }

    for (const n of nuvens) {
      n.x -= n.velocidade * dt * (n.camada + 1);
      if (n.x < -0.15) {
        n.x = 1.15;
        n.y = 0.08 + Math.random() * 0.84;
      }
    }
    for (let i = particulas.length - 1; i >= 0; i--) {
      const p = particulas[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vida -= p.decaimento;
      if (p.vida <= 0) particulas.splice(i, 1);
    }
    tremor *= 0.9;
  }

  // ---------- desenho ----------
  function desenharCeu() {
    const ceu = ctx.createLinearGradient(0, 0, 0, altura);
    ceu.addColorStop(0, "#5aa9ff");
    ceu.addColorStop(0.6, "#9fd3ff");
    ceu.addColorStop(1, "#d8f0ff");
    ctx.fillStyle = ceu;
    ctx.fillRect(-20, -20, largura + 40, altura + 40);

    // montanhas ao fundo
    ctx.fillStyle = "rgba(80, 130, 190, 0.25)";
    ctx.beginPath();
    ctx.moveTo(0, altura);
    for (let x = 0; x <= largura; x += 40) {
      ctx.lineTo(x, altura * 0.86 - Math.abs(Math.sin(x * 0.012 + 1)) * altura * 0.12);
    }
    ctx.lineTo(largura, altura);
    ctx.fill();

    for (const n of nuvens) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + n.camada * 0.2})`;
      const x = n.x * largura;
      const y = n.y * altura;
      for (const [dx, dy, r] of [[0, 0, 1], [0.7, 0.15, 0.75], [-0.7, 0.2, 0.7], [0.3, -0.35, 0.65]]) {
        ctx.beginPath();
        ctx.arc(x + dx * n.tamanho, y + dy * n.tamanho, r * n.tamanho * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function desenharGrade() {
    if (!estado.centro) return;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(20,50,90,0.6)";
    for (const passo of [-1, -0.5, 0.5, 1]) {
      const y = altura / 2 - passo * meiaAltura();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(largura, y);
      ctx.stroke();
      const preco = estado.centro * Math.exp(passo * estado.escala);
      ctx.fillText(preco.toLocaleString("pt-BR", { maximumFractionDigits: preco > 100 ? 2 : 4 }), 6, y - 4);
    }
    ctx.setLineDash([]);
  }

  function desenharPreco(agora) {
    const pontos = estado.pontos;
    if (pontos.length < 2 || !estado.centro) return null;
    const cabecaX = largura * CABECA_X;
    const pxPorSegundo = cabecaX / SEGUNDOS_VISIVEIS;
    const ultimo = pontos[pontos.length - 1];
    const tUltimo = new Date(ultimo.em).getTime();
    // `recebido` e Date.now() (o `agora` do requestAnimationFrame e outro relogio)
    const atraso = Math.max(0, Math.min(1, (Date.now() - (ultimo.recebido || Date.now())) / 1000));

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "#b14bff";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = "#7b2ff7";
    ctx.lineWidth = 4;
    ctx.beginPath();
    let primeiro = true;
    for (const p of pontos) {
      const x = cabecaX - ((tUltimo - new Date(p.em).getTime()) / 1000 + atraso) * pxPorSegundo;
      if (x < -20) continue;
      const y = yDoPreco(p.preco);
      if (primeiro) {
        ctx.moveTo(x, y);
        primeiro = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    const yCabeca = yDoPreco(ultimo.preco);
    ctx.lineTo(cabecaX, yCabeca);
    ctx.stroke();
    ctx.restore();

    // faisca na ponta
    const pulso = 6 + Math.sin(agora / 90) * 2;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#d38cff";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(cabecaX, yCabeca, pulso, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // linha vertical do "agora"
    ctx.strokeStyle = "rgba(123,47,247,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cabecaX, 0);
    ctx.lineTo(cabecaX, altura);
    ctx.stroke();
    return { x: cabecaX, y: yCabeca };
  }

  function desenharFaixaDeGelo() {
    if (estado.fase !== "congelado" && estado.fase !== "atingido" && estado.fase !== "livre") return;
    const y = yDoPreco(estado.alvo);
    // so o que acontece depois do gelo conta: a faixa nasce no "agora" do congelamento e desliza com o tempo
    const pxPorSegundo = (largura * CABECA_X) / SEGUNDOS_VISIVEIS;
    const inicio = Math.max(0, largura * CABECA_X - ((Date.now() - estado.inicioGelo) / 1000) * pxPorSegundo);
    const gradiente = ctx.createLinearGradient(0, y - 10, 0, y + 10);
    gradiente.addColorStop(0, "rgba(160,230,255,0)");
    gradiente.addColorStop(0.5, "rgba(160,230,255,0.75)");
    gradiente.addColorStop(1, "rgba(160,230,255,0)");
    ctx.fillStyle = gradiente;
    ctx.fillRect(inicio, y - 10, largura * AVIAO_X - inicio, 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px 'Segoe UI Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("❄️", inicio, y - 14);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.setLineDash([10, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(inicio, y);
    ctx.lineTo(largura * AVIAO_X - 40, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function desenharAviao(agora) {
    const x = largura * AVIAO_X + (estado.fase === "livre" ? aviao.saida * aviao.saida * 260 : 0);
    let y = aviao.y;
    let tremer = 0;
    if (estado.fase === "congelado") {
      const cabeca = precoAtual();
      if (cabeca) {
        const perto = Math.abs(yDoPreco(cabeca) - y) / altura;
        tremer = Math.max(0, 0.12 - perto) * 40;
      }
    }
    y += Math.sin(agora / 40) * tremer;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-aviao.inclinacao + aviao.giro);

    // fuselagem
    ctx.fillStyle = "#ff5a36";
    ctx.beginPath();
    ctx.ellipse(0, 0, 38, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    // bico
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.ellipse(34, 0, 8, 8, 0, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    // asa
    ctx.fillStyle = "#e63e1c";
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.lineTo(10, 2);
    ctx.lineTo(-10, 26);
    ctx.lineTo(-20, 26);
    ctx.closePath();
    ctx.fill();
    // cauda
    ctx.beginPath();
    ctx.moveTo(-30, -4);
    ctx.lineTo(-40, -24);
    ctx.lineTo(-30, -24);
    ctx.lineTo(-18, -6);
    ctx.closePath();
    ctx.fill();
    // cabine com o piloto
    ctx.fillStyle = "#bfe9ff";
    ctx.beginPath();
    ctx.ellipse(10, -8, 11, 8, 0, Math.PI, 0);
    ctx.fill();
    ctx.font = "15px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🐯", 10, -5);
    // helice
    ctx.fillStyle = "rgba(60,60,60,0.7)";
    const giroHelice = estado.fase === "congelado" ? 0 : Math.sin(agora / 25) * 14;
    ctx.fillRect(42, -giroHelice, 3, giroHelice * 2 || 14);
    ctx.restore();

    if (estado.fase === "congelado") desenharBlocoDeGelo(x, aviao.y + Math.sin(agora / 40) * tremer, agora);
    return { x, y };
  }

  function desenharBlocoDeGelo(x, y, agora) {
    const crescer = Math.min(1, (agora - estado.congeladoEm) / 250);
    const l = 110 * crescer;
    const a = 64 * crescer;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(190, 236, 255, 0.55)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-l / 2, -a / 2, l, a, 12);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-l / 2 + 12, -a / 2 + 18);
    ctx.lineTo(-l / 2 + 28, -a / 2 + 6);
    ctx.moveTo(l / 2 - 30, a / 2 - 8);
    ctx.lineTo(l / 2 - 12, a / 2 - 22);
    ctx.stroke();

    // anel do tempo que falta pro gelo derreter
    const total = Math.max(1, estado.expiraEm - estado.inicioGelo);
    const resta = Math.max(0, Math.min(1, (estado.expiraEm - Date.now()) / total));
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -a / 2 - 22, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * resta);
    ctx.stroke();
    ctx.fillStyle = "#0b3d66";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(Math.ceil((estado.expiraEm - Date.now()) / 1000)).replace("-", ""), 0, -a / 2 - 18);
    ctx.restore();
  }

  function desenharEtiqueta(posicao) {
    if (estado.fase !== "voo" && estado.fase !== "hangar" && estado.fase !== "congelado") return;
    const mult =
      estado.fase === "congelado" && estado.multiplicadorConfirmado
        ? estado.multiplicadorConfirmado
        : multiplicador(Math.abs(estado.distancia), estado.sigma, estado.duracao, estado.parametros || undefined);
    const cor = mult >= 7 ? "#ff2d55" : mult >= 3 ? "#ff8a00" : mult >= 1.6 ? "#f5c400" : "#2ecc71";
    const texto = `${mult.toFixed(2).replace(".", ",")}x`;
    ctx.save();
    ctx.font = "bold 20px system-ui, sans-serif";
    const larguraTexto = ctx.measureText(texto).width + 20;
    const x = posicao.x - larguraTexto / 2;
    const y = posicao.y + (estado.distancia >= 0 ? -70 : 46);
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect(x, y, larguraTexto, 30, 15);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(texto, posicao.x, y + 22);
    ctx.restore();
  }

  function desenharParticulas() {
    for (const p of particulas) {
      ctx.globalAlpha = Math.max(0, p.vida);
      if (p.texto) {
        ctx.font = `${p.tamanho}px 'Segoe UI Emoji', sans-serif`;
        ctx.fillText(p.texto, p.x, p.y);
      } else {
        ctx.fillStyle = p.cor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.tamanho * p.vida, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function desenharGeada() {
    const intensidade = estado.fase === "voo" ? estado.geada : estado.fase === "congelado" ? 0.55 : 0;
    if (intensidade <= 0) return;
    const g = ctx.createRadialGradient(largura / 2, altura / 2, Math.min(largura, altura) * 0.25,
      largura / 2, altura / 2, Math.max(largura, altura) * 0.75);
    g.addColorStop(0, "rgba(220,245,255,0)");
    g.addColorStop(1, `rgba(220,245,255,${intensidade})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, largura, altura);
  }

  function desenhar(agora) {
    ctx.save();
    if (tremor > 0.5) ctx.translate((Math.random() - 0.5) * tremor, (Math.random() - 0.5) * tremor);
    desenharCeu();
    desenharGrade();
    desenharFaixaDeGelo();
    desenharPreco(agora);
    const posicao = desenharAviao(agora);
    desenharEtiqueta(posicao);
    desenharParticulas();
    desenharGeada();
    ctx.restore();
  }

  function laco(agora) {
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    atualizar(dt);
    desenhar(agora);
    quadro = requestAnimationFrame(laco);
  }
  quadro = requestAnimationFrame(laco);

  return () => {
    cancelAnimationFrame(quadro);
    observador.disconnect();
    canvas.removeEventListener("pointermove", aoMover);
    canvas.removeEventListener("touchmove", aoTocar);
    window.removeEventListener("keydown", aoTeclar);
    window.removeEventListener("keyup", aoSoltar);
  };
}
