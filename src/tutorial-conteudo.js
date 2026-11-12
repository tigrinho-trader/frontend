// Conteúdo do tutorial do Flecha Certeira: uma lista de telas { titulo, html }. Os números (níveis, valor mínimo,
// taxa de devolução, campos liberados, entrada) vêm das regras atuais, para o texto nunca ficar desatualizado.
// O caminho do dinheiro (Pix, conversões, saques) fica no manual do projeto, não no jogo.
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
      html: `<p>Um <b>sistema de trading</b> em forma de jogo. Ele usa a <b>cotação das moedas em tempo real</b> e é
          ligado a uma <b>corretora</b>: cada flecha de mercado abre uma operação de verdade.</p>
        <p>Você atira para <b>prever se o preço sobe ou desce nos próximos 5 segundos</b>. Acertou o lado: volta o valor
          da flecha <b>mais o lucro</b> do contrato. Errou: perde o valor da flecha.</p>
        <p><b>Não é caça-níquel</b>: o jogo não sorteia nada e não ganha com a sua perda. O resultado vem do preço na
          corretora, e o valor de uma flecha errada fica com o contrato dela, não com o sistema. Ainda é trading de
          curtíssimo prazo: dá para perder.</p>
        <p>Use <b>&lt;</b> e <b>&gt;</b> (ou as setas do teclado) para passar as telas.</p>`,
    },
    {
      titulo: 'Moedas e carteira',
      html: `<ul>
          <li><b>1 moeda = R$ 1.</b> O saldo aparece no topo do menu.</li>
          <li>Compre moedas por <b>Pix</b> em <b>+ Comprar moedas</b>: o dinheiro vai para a sua conta na corretora,
            onde as operações acontecem.</li>
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
          <li>A operação (uma opção binária de 5 ticks na corretora) <b>abre no instante em que a flecha sai do
            arco</b>.</li>
          <li>O preço de entrada é o do tick seguinte na corretora, que pode ser um pouco diferente do "agora" da
            tela.</li>
        </ul>`,
    },
    {
      titulo: 'Resultado de cada flecha',
      html: `<ul>
          <li><b>Acertou</b>: volta o valor da flecha + o lucro do contrato. Na Volatilidade 100 o contrato paga
            <b>90,1%</b> do valor (medido em nov/2026), mas o lucro que chega é <b>um pouco menor</b>:</li>
        </ul>
        <ol>
          <li>A corretora opera em dólar: o valor da flecha vira dólar pela cotação do momento e é <b>arredondado para
            baixo no centavo de dólar</b>.</li>
          <li>O pagamento do contrato também é arredondado no centavo de dólar.</li>
        </ol>
        <p>Juntas, essas perdas ficam em <b>até uns R$ 0,10 por flecha</b>. Exemplo: flecha de R$ 10 com o dólar a
          R$ 5,59 → US$ 1,78 na corretora → lucro de US$ 1,60 = <b>R$ 8,94</b> (em vez de R$ 9,01). Voltam
          R$ 18,94.</p>
        <ul>
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
            <b>${percentual(taxa)}</b> (ex.: 3 flechas de R$ 10 voltam ${numero(30 * (1 - taxa))}). Antes de sair, o jogo
            mostra quanto você perde e pede um segundo clique.</li>
          <li><b>Madeira que sobra</b>: some (é grátis, não há o que devolver). As flechas não acumulam entre rodadas.</li>
          <li><b>Lucro da flecha</b>: a corretora paga em torno de 90% do valor quando você acerta, e fica com tudo
            quando erra. Para empatar no longo prazo é preciso acertar mais de ~53% das vezes.</li>
          <li><b>Empate</b>: a corretora fica com o contrato, mas o jogo devolve as moedas; essa diferença sai do seu
            dinheiro real.</li>
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
            para a corretora).</li>
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
