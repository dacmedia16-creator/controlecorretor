# Módulo "Leads em Massa"

Novo módulo administrativo para importar grandes listas de contatos (texto colado ou CSV), revisar uma prévia validada, salvar em lote e distribuir os leads entre os corretores.

## 1. Banco de dados (migration)

Nova tabela `lead_import_batches`:
- `id`, `name`, `total_rows`, `valid_count`, `invalid_count`, `duplicate_count`, `imported_count`, `created_by_user_id`, `created_at`

Alteração em `leads`:
- Adicionar `import_batch_id uuid` (FK para `lead_import_batches`, nullable, ON DELETE SET NULL)
- Adicionar índice em `phone_normalized` (nova coluna `text` gerada/preenchida) para deduplicação rápida
- Backfill `phone_normalized` a partir do `phone` existente

RLS:
- `lead_import_batches`: admin tem acesso total; corretor pode ler apenas lotes que contenham leads atribuídos a ele (via EXISTS em `leads`)
- Manter políticas atuais de `leads` intactas

Trigger:
- Atualizar contadores do lote (`imported_count`) quando leads forem inseridos com `import_batch_id`

## 2. Menu lateral

Adicionar item em `AppLayout.tsx`:
- "Leads em Massa" → `/leads-em-massa`, ícone `Upload`, role `admin` somente

## 3. Nova rota `/_authenticated/leads-em-massa.tsx`

Estrutura em abas (Tabs do shadcn):
- **Importar** — colar texto, upload CSV, prévia, salvar
- **Lotes** — lista dos lotes importados

### Aba Importar
- Campo "Nome do lote" (obrigatório)
- `Textarea` grande para colar contatos (suporta vários formatos)
- Input file `.csv` (parser simples, primeira linha = cabeçalho)
- Botão "Processar lista" → roda parser + validador localmente (cliente)
- Card com resumo: total / válidos / inválidos / duplicados / selecionados
- Tabela de prévia com checkbox por linha: nome, telefone original, telefone padronizado, status (Válido/Inválido/Duplicado), observação
- Botão "Importar selecionados" → chama server function

### Aba Lotes
- Tabela de `lead_import_batches`: nome, data, total, importados, inválidos, duplicados, criado por
- Clique no lote → navega para `/leads-em-massa/$batchId`

## 4. Rota `/_authenticated/leads-em-massa.$batchId.tsx`
- Cabeçalho do lote com contadores
- Lista dos leads do lote (filtro por status / corretor)
- Painel "Distribuir":
  - Selecionar corretor específico (todos sem responsável OU apenas selecionados)
  - "Distribuir igualmente entre corretores ativos"
  - "Distribuir por quantidade fixa por corretor"
- Botão "Chamar no WhatsApp" por linha (`https://wa.me/55<phone>`)

## 5. Server functions (`src/lib/bulk-leads.functions.ts`)

Todas com `requireSupabaseAuth` + checagem de role `admin`:
- `checkPhoneDuplicates({ phones }) → { existingPhones[] }` — valida no servidor contra `leads.phone_normalized`
- `createImportBatch({ name, rows[], counters }) → { batchId, importedCount }` — insere o lote + leads válidos não-duplicados em transação lógica (1 insert do batch + bulk insert dos leads)
- `listImportBatches()` / `getImportBatchLeads({ batchId })`
- `distributeLeads({ batchId, mode, brokerId?, count?, leadIds? })` — modos: `all_unassigned`, `selected`, `even_split`, `fixed_per_broker`

## 6. Utilitários (`src/lib/phone.ts`)
- `normalizePhone(raw)` → string só-dígitos sem `+55`, formato `DD9XXXXXXXX` ou `DDXXXXXXXX`
- `validateBrazilianPhone(normalized)` → `valid | invalid` (10 ou 11 dígitos, DDD plausível)
- `parseContactLine(line)` → `{ name?, rawPhone }` (regex pega último bloco numérico, resto vira nome se houver separador `-,|:` )
- `parseCsv(text)` → array de objetos com colunas `nome, telefone, cidade, bairro, origem, observacoes`
- `whatsappLink(normalized)` → `https://wa.me/55<digits>`

Toda validação é feita também no servidor antes do insert (não confiar no cliente).

## 7. Filtros adicionais

Adicionar dropdown "Lote" em:
- `/_authenticated/leads.tsx` (admin)
- `/_authenticated/kanban.tsx`
- `/_authenticated/meus-leads.tsx`

Carregando opções de `lead_import_batches`.

## 8. Dashboard
- Card adicional: "Leads importados em massa" (count de leads com `import_batch_id IS NOT NULL`)
- Card: "Lotes ativos" (lotes com leads não distribuídos)

## 9. Integração com Kanban
- Leads novos entram com `status_id` = status com menor `position` ativo (já é "Novo lead")
- Se existir status "Distribuído", após `distributeLeads` mover para esse status (verificar pelo nome, fallback: manter "Novo lead")

## 10. Compatibilidade
Sem mudanças destrutivas em `leads`, `profiles`, `kanban_statuses`, `lead_interactions`. Apenas adições. Telas existentes continuam funcionando.

---

## Detalhes técnicos

**Parser de telefone (regex)**: extrair `\d+` da linha, juntar, remover prefixo `55` se resultar em 12-13 dígitos, validar 10/11 dígitos finais com DDD entre 11-99.

**Deduplicação**: feita em duas camadas — (1) dentro do lote sendo importado, (2) contra `leads.phone_normalized` via server function antes do insert.

**Performance bulk insert**: dividir em chunks de 500 linhas no `supabase.from('leads').insert([...])` se necessário.

**Distribuição igualitária**: round-robin sobre `profiles` ativos com role `corretor`, atualizando `assigned_to_user_id` em batch via `.in('id', leadIds)` por corretor.

**CSV parsing**: implementação leve manual (split por linha, split por `,` respeitando aspas) — sem nova dependência.

**RLS para corretores verem o lote**: política SELECT em `lead_import_batches` que checa `EXISTS (SELECT 1 FROM leads WHERE import_batch_id = lead_import_batches.id AND assigned_to_user_id = auth.uid())`.

**Arquivos novos**:
- `supabase/migrations/<timestamp>_bulk_leads.sql`
- `src/lib/phone.ts`
- `src/lib/bulk-leads.functions.ts`
- `src/routes/_authenticated/leads-em-massa.tsx`
- `src/routes/_authenticated/leads-em-massa.$batchId.tsx`
- `src/components/BulkImportPreview.tsx`
- `src/components/DistributeLeadsDialog.tsx`

**Arquivos editados**:
- `src/components/AppLayout.tsx` (novo item de menu)
- `src/routes/_authenticated/leads.tsx`, `kanban.tsx`, `meus-leads.tsx` (filtro por lote)
- `src/routes/_authenticated/dashboard.tsx` (cards novos)
