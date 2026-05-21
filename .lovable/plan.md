## Correção

**Arquivo:** `src/hooks/useRecruiterNotifications.ts`

1. Trocar `soundEnabled` por uma `ref` (`soundEnabledRef`) que é atualizada por um `useEffect` separado sempre que o estado mudar. Assim o callback do realtime continua lendo o valor atual, sem precisar recriar o canal.
2. Remover `soundEnabled` das dependências do `useEffect` que cria o canal — deixar apenas `[enabled, user]`.
3. Garantir cleanup robusto: `supabase.removeChannel(channel)` já está, mas adicionar guarda para não recriar se `user.id` não mudou (cobre StrictMode/double-invoke em dev).

**Resultado esperado:** o canal é criado **uma única vez** por usuário logado. Ligar/desligar som não recria a inscrição, eliminando o erro `cannot add postgres_changes callbacks ... after subscribe()`. A página `/recrutamento/dashboard` volta a carregar normalmente.

Sem mudanças em banco, em outros componentes, ou no comportamento visível (sino, badge, som e toast continuam funcionando igual).