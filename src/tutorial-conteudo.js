// Conteúdo do tutorial do Flecha Certeira: uma lista de telas { titulo, html }. Os números (níveis, valor mínimo,
// taxa de devolução, campos liberados, entrada) vêm das regras atuais, para o texto nunca ficar desatualizado.
import {
  ARROW_TYPES, NIVEIS_FLECHA, RANGES, TAXA_DEVOLUCAO_PADRAO, VALOR_MINIMO_FLECHA, campoEmDesenvolvimento,
  emDesenvolvimento, entradaLivre,
} from './regras.js';

const numero = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const percentual = f => `${(Number(f) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** "a", "a e b", "a, b e c". */
export function listar(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** As telas do tutorial com as regras de agora ({ niveis, minimo, taxaDevolucao }, as mesmas do jogo). */
export function slidesTutorial(regras = {}) {
  const niveis = Array.isArray(regras.niveis) && regras.niveis.length >= 3 ? regras.niveis : NIVEIS_FLECHA;
  const minimo = Number(regras.minimo) > 0 ? Number(regras.minimo) : VALOR_MINIMO_FLECHA;
  const taxa = Number.isFinite(Number(regras.taxaDevolucao)) ? Number(regras.taxaDevolucao) : TAXA_DEVOLUCAO_PADRAO;
  const liberados = RANGES.filter(r => !campoEmDesenvolvimento(r)).map(r => r.name);
  const fechados = RANGES.filter(campoEmDesenvolvimento).map(r => r.name);
  const mercado = ARROW_TYPES.filter(t => t.mercado);
  const aVenda = mercado.filter(t => !emDesenvolvimento(t.mercado)).map(t => t.name);
  const semVenda = mercado.filter(t => emDesenvolvimento(t.mercado)).map(t => t.name);
  const livre = RANGES.every(entradaLivre);
  const entradas = RANGES.map(r => `${r.name}: ${numero(r.fee)}`).join(' · ');

  return [
    {
      titulo: 'Flecha Certeira',
      html: `<p>Você atira flechas para <b>prever se o preço sobe ou desce nos próximos 5 segundos</b>.</p>
        <p>Acertou o lado: volta o valor da flecha <b>mais o lucro</b>. Errou: perde o valor da flecha.</p>
        <p>Use <b>&lt;</b> e <b>&gt;</b> (ou as setas do teclado) para passar as telas.</p>`,
    },
    {
      titulo: 'Moedas e carteira',
      html: `<ul>
          <li><b>1 moeda = R$ 1.</b> O saldo aparece no topo do menu.</li>
          <li>Compre moedas por <b>Pix</b> em <b>+ Comprar moedas</b>: o dinheiro vai para a sua conta na Deriv, onde
            as operações acontecem.</li>
          <li>As moedas entram assim que o Pix é confirmado.</li>
        </ul>`,
    },
    {
      titulo: 'Campos',
      html: `<ul>
          <li>Liberados: <b>${listar(liberados)}</b>.</li>
          ${fechados.length ? `<li>Em desenvolvimento (ainda não dá para entrar): ${listar(fechados)}.</li>` : ''}
          <li>Entrada: ${livre ? '<b>livre por tempo limitado</b>' : entradas}.</li>
          <li>Cada campo tem pássaros mais rápidos e mais difíceis conforme a dificuldade (➶).</li>
        </ul>`,
    },
    {
      titulo: 'Flechas',
      html: `<ul>
          <li><b>Madeira</b>: grátis. É treino: não abre operação nem mexe no saldo.</li>
          <li><b>Mercado</b> (${listar(aVenda) || 'nenhuma ainda'}): você escolhe o valor de cada flecha.
            Nível 1 = ${numero(niveis[0])}, Nível 2 = ${numero(niveis[1])}, Nível 3 = ${numero(niveis[2])} moedas,
            ou Personalizado (a partir de ${numero(minimo)} moeda).</li>
          ${semVenda.length ? `<li>${listar(semVenda)}: flecha em desenvolvimento (ainda não é vendida).</li>` : ''}
          <li>Até 40 flechas na aljava. A tecla de cada espaço (1, 2, 3...) troca a flecha na mão; <b>F</b> compra mais
            sem sair do campo.</li>
        </ul>`,
    },
    {
      titulo: 'Como atirar',
      html: `<ul>
          <li><b>Puxe para trás e solte.</b></li>
          <li>Mire <b>acima da linha do meio para SOBE</b> e <b>abaixo para DESCE</b>.</li>
          <li>A flecha leva <b>5 s</b> até a faixa na coluna da direita.</li>
          <li><b>Madeira</b>: acerta os pássaros que estiverem na faixa escolhida quando ela chegar. Escolha um pássaro
            e acompanhe no olho.</li>
          <li><b>Mercado</b>: acerta se o preço andou para o lado que você escolheu.</li>
        </ul>`,
    },
    {
      titulo: 'Cancelar o tiro',
      html: `<p>Mudou de ideia enquanto puxava? <b>Puxe para a frente</b> (na direção do alvo) e solte.</p>
        <p>Aparece o aviso <b>"Solte para CANCELAR"</b>: nada é enviado e a flecha volta para a aljava.</p>
        <p>Voltando a puxar para trás antes de soltar, o tiro normal volta.</p>`,
    },
    {
      titulo: 'Quando o trade acontece',
      html: `<ul>
          <li><b>Comprar flechas não é o trade</b>: só separa o dinheiro da rodada.</li>
          <li><b>Mirar também não</b>: enquanto você segura e escolhe sobe ou desce, nada é enviado.</li>
          <li>A operação (uma opção binária de 5 ticks na Deriv) <b>abre no instante em que a flecha sai do arco</b>.</li>
          <li>O preço de entrada é o do tick seguinte na Deriv, que pode ser um pouco diferente do "agora" da tela.</li>
        </ul>`,
    },
    {
      titulo: 'Resultado de cada flecha',
      html: `<ul>
          <li><b>Acertou</b>: volta o valor da flecha + o lucro que a Deriv paga no contrato (na Volatilidade 100, em
            torno de 90% do valor).</li>
          <li><b>Errou</b>: perde o valor da flecha.</li>
          <li><b>Empate</b> (o preço terminou igual): o jogo devolve o valor.</li>
          <li>Se a operação falhar ou for recusada, o valor também volta.</li>
        </ul>`,
    },
    {
      titulo: 'Taxas do jogo',
      html: `<ul>
          <li><b>Entrada dos campos</b>: ${livre ? `livre por tempo limitado (a tabela é ${entradasDeTabela()})` : entradas}.</li>
          <li><b>Flechas de mercado que sobram</b>: voltam em moedas ao sair do campo, com taxa de
            <b>${percentual(taxa)}</b>.</li>
          <li><b>Madeira que sobra</b>: some (é grátis, não há o que devolver). As flechas não acumulam entre rodadas.</li>
          <li><b>Lucro da flecha</b>: a Deriv paga em torno de 90% do valor quando você acerta, e fica com tudo quando
            erra. Para empatar no longo prazo é preciso acertar mais de ~53% das vezes.</li>
          <li><b>Empate</b>: a Deriv fica com o contrato, mas o jogo devolve as moedas; essa diferença sai do seu
            dinheiro real.</li>
        </ul>`,
    },
    {
      titulo: 'Caminho do dinheiro: onde ele encolhe',
      html: `<p>Na ida, cada etapa come um pouco:</p>
        <ol>
          <li><b>Pix no Asaas</b>: o Asaas cobra para receber. No seu teste, um Pix de R$ 40 virou <b>R$ 39,21</b>.</li>
          <li><b>Asaas → Binance</b>: o Asaas paga um Pix para a Binance (pode ter taxa do Asaas por Pix enviado).</li>
          <li><b>Real → dólar (USDT) na Binance</b>: taxa de negociação (~0,1%) e a diferença de preço da compra.</li>
          <li><b>Binance → carteira ponte</b>: taxa de saque da Binance na rede BSC, descontada do USDT.</li>
          <li><b>Carteira ponte → Deriv</b>: o "gás" da rede BSC, pago em BNB (centavos).</li>
          <li><b>USDT → USD na Deriv</b>: a carteira passa para a conta Options pela cotação da Deriv.</li>
        </ol>
        <p>No seu teste: <b>R$ 40 viraram +US$ 7,12</b> na conta Options, em uns 9 minutos.</p>
        <p>Por isso as <b>moedas</b> do jogo (que contam o Pix inteiro) ficam um pouco acima do dinheiro que chega na
          Deriv.</p>`,
    },
    {
      titulo: 'E na volta',
      html: `<ul>
          <li><b>Sacar Pix</b> (no jogo): sai do caixa do Asaas para a sua chave; o Asaas pode cobrar a taxa de
            transferência dele.</li>
          <li>O dinheiro que está na Deriv <b>não volta sozinho</b>: o saque da Deriv é manual. Na volta tem taxa de
            novo: saque de USDT, venda por reais na Binance e o Pix da Binance (cerca de R$ 3,50 por saque).</li>
          <li>Para repor o caixa do Asaas: Deriv → Binance (USDT) → vender por reais → Pix para o Asaas.</li>
        </ul>`,
    },
    {
      titulo: 'Durante a rodada',
      html: `<ul>
          <li>O que você ganha no campo <b>já pode comprar mais flechas</b>, sem sair.</li>
          <li><b>Sair</b> encerra a rodada: o resultado vai para a carteira.</li>
          <li>Se a internet cair, a rodada parada é encerrada sozinha depois de 10 minutos e o resultado vai para a
            carteira. Nada se perde.</li>
        </ul>`,
    },
    {
      titulo: 'Sacar',
      html: `<ul>
          <li><b>Sacar Pix</b> troca moedas por reais (1 moeda = R$ 1) para uma chave Pix sua.</li>
          <li>O Pix sai do <b>caixa do Asaas</b>: o dinheiro que você deixou lá, fora das compras de moedas (essas vão
            para a Deriv).</li>
          <li>O limite é o menor entre as suas moedas e o caixa livre. O jogo pede confirmação antes de enviar.</li>
        </ul>
        <p>Bom jogo! O botão <b>? Tutorial</b> no menu abre estas telas de novo.</p>`,
    },
  ];
}

/** A tabela de entrada guardada (o valor que volta a ser cobrado quando a entrada livre acabar). */
function entradasDeTabela() {
  return '0,5 / 1,5 / 4 / 10';
}
