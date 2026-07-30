## Objetivo

Conectar a agenda RE/MAX (`denissouza@remax.com.br`) ao sistema em **modo somente leitura**, já que o Workspace RE/MAX bloqueia compartilhamento externo com permissão de edição.

Resultado: os compromissos da RE/MAX aparecem na Agenda do sistema (evitando conflitos de horário), enquanto entrevistas criadas aqui continuam indo para a agenda pessoal já conectada.

## O que muda

**1. Conexão de serviço nasce como leitura**
Ao conectar uma agenda de serviço, gravar `sync_in = true` e `sync_out = false`. Assim o sistema lê os eventos, mas nunca tenta criar/editar/excluir naquela agenda — evitando erros 403 do Google.

**2. Detecção automática do nível de acesso**
No "Testar e conectar", além de validar o acesso, verificar se a conta de serviço tem permissão de escrita. Se tiver apenas leitura, avisar de forma clara no resultado ("conectada em modo somente leitura") em vez de falhar.

**3. Ajuste dos textos do diálogo**
Hoje o passo 1 pede "Fazer alterações nos eventos". Passar a explicar as duas possibilidades:
- Com permissão de alteração → sincronização completa
- Só com "Ver todos os detalhes" (caso de organizações restritas como a RE/MAX) → leitura, ainda útil para ver os compromissos

**4. Indicação visual na Agenda**
No card de contas Google, exibir badge **"Somente leitura"** nas conexões com `sync_out = false`, para ficar claro que eventos criados no sistema não vão para aquela agenda.

**5. Proteção nas operações de escrita**
Garantir que criar/editar/excluir evento ignore conexões somente leitura (o filtro `sync_out` já existe — será revisado para cobrir todos os caminhos, inclusive exclusão e reagendamento).

## Depois de aplicar

Você abre **Agenda** → botão de escudo **"Conectar agenda de serviço"** → cola `denissouza@remax.com.br` → **Testar e conectar**. Sem tela de login do Google.

## Detalhes técnicos

- `src/lib/google-calendar.functions.ts` — `connectServiceCalendar`: gravar `sync_in: true`, `sync_out: false`; testar escrita com uma chamada leve à API do Calendar e retornar `writable: boolean`.
- `src/components/ServiceCalendarDialog.tsx` — textos do passo 1 e toast de sucesso diferenciando leitura/escrita.
- `src/components/GoogleCalendarBanner.tsx` — badge "Somente leitura" quando `sync_out === false`.
- Revisão das funções de escrita em `google-calendar.server.ts` / `.functions.ts` para confirmar o filtro `syncOut: true` em todos os caminhos.
- Sem migração de banco: as colunas `sync_in`, `sync_out` e `auth_type` já existem.
