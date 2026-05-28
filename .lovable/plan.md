## Agenda — calendário de compromissos

Nova página `/agenda` (rota autenticada) com visualização **semanal por hora** mostrando entrevistas e follow-ups marcados, visível para todos os usuários autenticados.

### Item de menu
Adicionar em `src/components/AppLayout.tsx` no `NAV`:
- `{ to: "/agenda", label: "Agenda", icon: CalendarDays, roles: ["admin","corretor","recrutador","gerente_recrutamento"] }`

### Rota
`src/routes/_authenticated/agenda.tsx`

### Fontes de dados (todos veem tudo)
Buscas no client com `supabase`:
1. **Entrevistas de candidatos** — `broker_candidate_interactions` onde `interaction_type='entrevista'` e `next_follow_up_date` dentro da semana visível. Join com `broker_candidates(id,name,phone)`.
2. **Follow-ups de candidatos** — `broker_candidate_interactions` onde `interaction_type<>'entrevista'` e `next_follow_up_date` dentro da semana. Join com `broker_candidates`.
3. **Follow-ups de leads** — `lead_interactions` com `next_follow_up_date` dentro da semana. Join com `leads(id,name,phone)`.

Filtros por intervalo: `.gte("next_follow_up_date", weekStartIso).lt("next_follow_up_date", weekEndIso)`.

> Observação RLS: as policies atuais de `broker_candidate_interactions` / `broker_candidates` / `lead_interactions` restringem leitura para recrutador/corretor a registros próprios. "Todos veem tudo" portanto significa: admin/gerente veem tudo de fato; recrutadores e corretores veem só os seus (limitação do RLS atual). Sem mudança de policy nesta entrega.

### UI — visão semanal
- Cabeçalho: botões `‹ Hoje ›`, label `27 mai – 02 jun 2026`, seletor de visão (Semana padrão; Mês opcional num passo futuro).
- Grade: 7 colunas (dom–sáb) × linhas de hora (07:00–21:00, slot de 30 min). Linha do "agora" destacada.
- Eventos posicionados pelo horário, cor por tipo:
  - Entrevista (candidato) → cor primária
  - Follow-up candidato → âmbar
  - Follow-up lead → azul
- Cada bloco mostra hora + nome. Clique abre um `Popover` com: tipo, nome, telefone com link WhatsApp, link "Abrir" para `/recrutamento/$id` ou `/leads/$id`, notas curtas.
- Legenda de cores no topo. Vazio: "Nenhum compromisso nesta semana."
- Mobile: rolagem horizontal da grade.

### Detalhes técnicos
- Estado da semana via `useState<Date>` (segunda-feira como início). Helpers de data inline (sem nova dependência).
- `useQuery` com chave `["agenda", weekStartIso]`.
- Reaproveitar `formatDate`, `whatsappUrl` de `@/lib/constants`.
- Sem mudanças em backend, sem migrations.

### Fora do escopo
- Criar/editar compromissos a partir da agenda (continua pelos diálogos existentes).
- Sincronização com Google Calendar nesta tela.
- Visão mensal (pode ser adicionada depois).
- Ajuste de RLS para permitir recrutador/corretor ver compromissos alheios.