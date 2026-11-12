// Tutorial do Flecha Certeira: o jogo explicado em telas, com < e > (ou as setas do teclado).
// Abre sozinho no primeiro acesso deste navegador; o botão "? Tutorial" do menu abre de novo.
import { setState, estadoAtual, regrasAtuais } from './jogo.js';
import { slidesTutorial } from './tutorial-conteudo.js';

export const CHAVE_TUTORIAL_VISTO = 'flecha-tutorial-visto';

const $ = id => document.getElementById(id);
const tutorial = { i: 0, slides: [], volta: 'menu' };

function desenhar() {
  const total = tutorial.slides.length;
  const slide = tutorial.slides[tutorial.i];
  $('tutorial-titulo').textContent = slide.titulo;
  $('tutorial-texto').innerHTML = slide.html;   // conteúdo fixo do próprio jogo (tutorial-conteudo.js)
  $('tutorial-passo').textContent = `${tutorial.i + 1} / ${total}`;
  $('tutorial-pontos').innerHTML = tutorial.slides
    .map((_, k) => `<span class="${k === tutorial.i ? 'atual' : ''}"></span>`).join('');
  const ultimo = tutorial.i === total - 1;
  $('btn-tutorial-anterior').disabled = tutorial.i === 0;
  $('btn-tutorial-proximo').disabled = ultimo;
  $('btn-tutorial-fechar').textContent = ultimo ? 'Começar a jogar' : 'Fechar';
}

/** Abre o tutorial na primeira tela e lembra (neste navegador) que ele já foi visto. */
export function abrirTutorial() {
  const atual = estadoAtual();
  tutorial.volta = atual && atual !== 'tutorial' ? atual : 'menu';
  tutorial.slides = slidesTutorial(regrasAtuais());
  tutorial.i = 0;
  desenhar();
  setState('tutorial');
  try { localStorage.setItem(CHAVE_TUTORIAL_VISTO, '1'); } catch { /* sem armazenamento: abre de novo na próxima */ }
}

export function fecharTutorial() {
  if (estadoAtual() === 'tutorial') setState(tutorial.volta);
}

/** Vai para a tela anterior (-1) ou a próxima (+1), sem passar das pontas. */
export function passarTutorial(passo) {
  tutorial.i = Math.max(0, Math.min(tutorial.slides.length - 1, tutorial.i + passo));
  desenhar();
}

/** No primeiro acesso deste navegador, com o menu aberto, mostra o tutorial sozinho. */
export function talvezMostrarTutorial() {
  let visto = false;
  try { visto = Boolean(localStorage.getItem(CHAVE_TUTORIAL_VISTO)); } catch { visto = false; }
  if (!visto && estadoAtual() === 'menu') abrirTutorial();
}

$('btn-tutorial').addEventListener('click', abrirTutorial);
$('btn-tutorial-anterior').addEventListener('click', () => passarTutorial(-1));
$('btn-tutorial-proximo').addEventListener('click', () => passarTutorial(1));
$('btn-tutorial-fechar').addEventListener('click', fecharTutorial);
window.addEventListener('keydown', e => {
  if (estadoAtual() !== 'tutorial') return;
  if (e.key === 'ArrowRight') passarTutorial(1);
  else if (e.key === 'ArrowLeft') passarTutorial(-1);
  else if (e.key === 'Escape') fecharTutorial();
});
