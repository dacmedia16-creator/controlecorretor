## Objetivo
Quando um usuário com papel `recrutador` fizer login (ou abrir a raiz `/`), ele deve ser direcionado automaticamente para `/recrutamento/dashboard` em vez de `/meus-leads`.

## Causa atual
- `src/routes/login.tsx` (linha 28) redireciona somente com base em `admin` → `/dashboard`, qualquer outro papel → `/meus-leads`. O papel `recrutador` cai no fallback errado.
- `src/routes/index.tsx` já trata `recrutador` corretamente, mas o login não passa por lá.

## Mudanças
1. **`src/routes/login.tsx`** — Atualizar o `useEffect` de redirecionamento pós-login para incluir o papel `recrutador`:
   - `admin` → `/dashboard`
   - `recrutador` → `/recrutamento/dashboard`
   - demais (corretor) → `/meus-leads`

Nenhuma alteração de backend, banco ou outros arquivos é necessária — `index.tsx` já está correto e serve como fallback caso o usuário acesse a raiz.
