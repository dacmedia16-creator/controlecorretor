## Objetivo

Separar leads de **captação de imóveis** dos leads de **compra/aluguel** em dois fluxos independentes, com etapas (colunas do Kanban) próprias para cada um, mantendo o que já existe (Kanban geral, Kanban Leads em Massa) sem quebrar nada.

## Conceito

Hoje `kanban_type` aceita `general` e `bulk_leads`. Vamos expandir para suportar a dimensão "tipo de negócio":

- `general` → leads manuais de compra/venda/aluguel (fluxo atual)
- `general_captacao` → leads manuais de captação de imóvel (novo)
- `bulk_leads` → leads importados em massa de compra (fluxo atual)
- `bulk_captacao` → leads importados em massa de captação (novo)

O campo `interest_type` (`captar` vs `comprar/vender/alugar`) continua existindo no lead e passa a **determinar** em qual Kanban o lead vive. A trigger `enforce_lead_status_kanban_type` será atualizada para validar essa correspondência.

## Mudanças no banco

1. **Seed de novos status** em `kanban_statuses`:
   - `general_captacao`: Novo contato → Avaliação agendada → Avaliação feita → Proposta de exclusividade → Contrato de captação assinado → Imóvel publicado → Perdido
   - `bulk_captacao`: Novo contato em massa → WhatsApp enviado → Aguardando resposta → Avaliação agendada → Captado → Sem interesse → Número inválido
2. **Atualizar** `enforce_lead_status_kanban_type` para também considerar `interest_type = 'captar'` ao decidir qual conjunto de status é válido.
3. **Adicionar** coluna `default_interest_type` em `lead_import_batches` (`'comprar' | 'captar'`) para registrar o tipo do lote.

## Mudanças no frontend

### Menu lateral (`AppLayout.tsx`)
Agrupar em duas seções:
- **Compra/Venda/Aluguel:** Kanban, Kanban Leads em Massa
- **Captação:** Kanban Captação, Kanban Captação em Massa

### Novas rotas
- `src/routes/_authenticated/kanban-captacao.tsx` — clone enxuto do `kanban.tsx` filtrando `interest_type='captar'` e `kanban_type='general_captacao'`
- `src/routes/_authenticated/kanban-captacao-massa.tsx` — clone enxuto do `kanban-massa.tsx` filtrando `interest_type='captar'` e `kanban_type='bulk_captacao'`

### Rotas existentes (ajustes mínimos)
- `kanban.tsx` e `kanban-massa.tsx`: passam a filtrar `interest_type != 'captar'`.
- `LeadFormDialog.tsx`: ao escolher `interest_type='captar'`, recarrega status com `kanban_type='general_captacao'`; senão `general`.
- `meus-leads.tsx` e `leads.$id.tsx`: filtro de status passa a depender de `(import_batch_id, interest_type)`.
- `leads-em-massa.tsx`: ao criar um lote, perguntar **"Tipo deste lote: Compra/Aluguel ou Captação"**, salvar em `default_interest_type`, e usar isso para decidir o `interest_type` e o `status_id` inicial dos leads importados.
- `distribuicao.tsx`: filtro adicional por tipo do lote (visual apenas).
- `configuracoes.kanban.tsx`: 4 abas (general / general_captacao / bulk_leads / bulk_captacao).

### Dashboard
Nova seção **Captação** ao lado de **Vendas** com: leads de captação ativos, taxa de conversão, imóveis captados no período, ranking de corretores por captação.

## Permissões

Sem mudança: RLS já filtra por `assigned_to_user_id` para corretor e libera tudo para admin. As novas rotas herdam o mesmo modelo.

## Diagrama de fluxo

```text
                    ┌──────────────────────────┐
                    │     interest_type        │
                    └──────────────────────────┘
                       /                    \
              comprar/vender/alugar      captar
                     │                       │
        ┌────────────┴────────────┐  ┌───────┴────────────────┐
        │ Kanban geral            │  │ Kanban Captação        │
        │ (kanban_type=general)   │  │ (general_captacao)     │
        └─────────────────────────┘  └────────────────────────┘
        ┌─────────────────────────┐  ┌────────────────────────┐
        │ Kanban Leads em Massa   │  │ Kanban Captação Massa  │
        │ (bulk_leads)            │  │ (bulk_captacao)        │
        └─────────────────────────┘  └────────────────────────┘
```

## O que NÃO muda

- Tabela `leads`, `lead_interactions`, `profiles`, RLS, autenticação.
- Telas de Leads, Meus Leads, Corretores, Distribuição (apenas ganham o filtro por tipo).
- Histórico de interações e regras de log de mudança de status.

## Ordem de execução

1. Migration: novos seeds + coluna `default_interest_type` + atualização da trigger.
2. Atualizar `LeadFormDialog` e telas existentes para reconhecer `interest_type='captar'`.
3. Criar as duas novas rotas de Kanban Captação.
4. Atualizar fluxo de importação em massa para perguntar o tipo do lote.
5. Atualizar Dashboard e Configurações de Kanban.
6. Smoke test: criar lead de captação manual, importar lote de captação, mover cards, conferir que não aparecem no Kanban de compra.
