## Situação verificada

- As requisições da tela `/agenda` retornam **9 entrevistas** entre 27/07 e 02/08 (dados confirmados no banco e nas respostas de rede do navegador).
- Os candidatos vinculados (nome/telefone) também são retornados corretamente.
- Ou seja: **não é falta de dados nem bloqueio de permissão**. O problema está na exibição da grade.

Causa provável (ainda não confirmada): a grade da semana tem ~1260px de altura e sua janela mostra ~640px, então boa parte dos horários fica fora da área visível; combinado com o container de rolagem do quadro, os cards podem estar "escondidos" abaixo. Não vou assumir isso como certo — o primeiro passo é confirmar.

## Passos

1. **Confirmar o sintoma na tela**
   - Abrir a Agenda em modo automatizado (mesmo tamanho de tela que você usa), capturar a tela e contar quantos cards existem no DOM e em que posição estão.
   - Isso separa dois cenários: (a) cards existem mas estão fora da área visível; (b) cards não são criados por um erro de renderização.

2. **Se for visibilidade (cenário mais provável)**
   - Dar altura fixa ao quadro com rolagem interna própria, em vez de esticar a página inteira.
   - Rolar automaticamente para o horário atual (ou para o primeiro compromisso do dia) ao abrir a tela.
   - Comprimir a escala vertical (hora mais baixa) para caber mais horas na tela, mantendo os cards legíveis.
   - Ajustar a faixa de horas exibida para começar no primeiro compromisso da semana quando houver algo antes das 07:00.

3. **Se for erro de renderização**
   - Corrigir o ponto exato encontrado no passo 1 (ex.: cálculo de posição, filtro de dia, fuso).

4. **Reforços de usabilidade (independente da causa)**
   - Mostrar um contador "X compromissos nesta semana" no topo, para nunca dar a impressão de agenda vazia.
   - Adicionar uma alternância **Semana / Lista**, onde a Lista exibe todos os compromissos da semana em ordem cronológica — útil no celular e como garantia de que nada some.

5. **Validação final**
   - Reabrir a Agenda, conferir visualmente que as entrevistas de 27, 29, 30 e 31/07 aparecem nos dias e horários corretos (horário de Brasília) e que arrastar continua funcionando.

## Detalhes técnicos

- Arquivo principal: `src/routes/_authenticated/agenda.tsx` (constantes `HOUR_START`, `HOUR_END`, `PX_PER_MIN`, função `eventStyle`, container `Card`).
- Nenhuma alteração de banco de dados, RLS ou integração com Google Calendar é necessária.
