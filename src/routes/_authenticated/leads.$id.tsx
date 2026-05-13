import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Pencil, MessageCircle, Phone, Mail, MapPin, Calendar } from "lucide-react";
import { LeadFormDialog } from "@/components/LeadFormDialog";
import { InteractionDialog } from "@/components/InteractionDialog";
import { formatDate, INTERACTION_RESULTS, INTERACTION_TYPES, labelOf, whatsappUrl } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  component: LeadDetail,
});

function LeadDetail() {
  const { id } = useParams({ from: "/_authenticated/leads/$id" });
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [interOpen, setInterOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const [lead, interactions, statuses, brokers] = await Promise.all([
        supabase.from("leads").select("*").eq("id", id).maybeSingle(),
        supabase.from("lead_interactions").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
        supabase.from("kanban_statuses").select("id,name,color,kanban_type").order("position"),
        supabase.from("profiles").select("id,name"),
      ]);
      const isBulk = !!lead.data?.import_batch_id;
      let batch: { id: string; name: string; created_at: string } | null = null;
      if (isBulk && lead.data?.import_batch_id) {
        const { data: b } = await supabase
          .from("lead_import_batches")
          .select("id,name,created_at")
          .eq("id", lead.data.import_batch_id)
          .maybeSingle();
        batch = b ?? null;
      }
      return {
        lead: lead.data,
        interactions: interactions.data ?? [],
        statuses: statuses.data ?? [],
        brokers: brokers.data ?? [],
        batch,
        isBulk,
      };
    },
  });

  if (isLoading || !data) return <div>Carregando…</div>;
  if (!data.lead) return <div>Lead não encontrado.</div>;

  const lead = data.lead;
  const status = data.statuses.find((s) => s.id === lead.status_id);
  const broker = data.brokers.find((b) => b.id === lead.assigned_to_user_id);
  const userName = (uid: string) => data.brokers.find((b) => b.id === uid)?.name ?? "—";

  async function changeStatus(statusId: string) {
    const { error } = await supabase.from("leads").update({ status_id: statusId }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["lead", id] }); }
  }

  const wantedKanban = data.isBulk ? "bulk_leads" : "general";
  const statusesForLead = data.statuses.filter((s: any) => s.kanban_type === wantedKanban);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/leads"><Button variant="ghost" size="icon"><ArrowLeft className="size-4" /></Button></Link>
        <h1 className="text-xl font-bold">{lead.name}</h1>
        {status && <Badge style={{ backgroundColor: status.color, color: "white" }}>{status.name}</Badge>}
        <Badge variant={data.isBulk ? "default" : "secondary"}>
          {data.isBulk ? "Lead em massa" : "Lead normal"}
        </Badge>
        {data.isBulk && data.batch && (
          <span className="text-xs text-muted-foreground">
            Lote: <span className="font-medium text-foreground">{data.batch.name}</span>
            {" · "}importado em {formatDate(data.batch.created_at)}
            {" · "}Kanban: Leads em Massa
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Dados do lead</h2>
            <div className="flex gap-2">
              {lead.phone && (
                <a href={whatsappUrl(lead.phone)} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm"><MessageCircle className="mr-2 size-4" />WhatsApp</Button>
                </a>
              )}
              <Button size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-2 size-4" />Editar</Button>
            </div>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <Info icon={Phone} label="Telefone" value={lead.phone} />
            <Info icon={Mail} label="E-mail" value={lead.email} />
            <Info icon={MapPin} label="Cidade / Bairro" value={[lead.city, lead.neighborhood].filter(Boolean).join(" / ") || null} />
            <Info icon={Calendar} label="Cadastro" value={formatDate(lead.created_at)} />
            <Info label="Tipo de imóvel" value={lead.property_type} />
            <Info label="Tipo de interesse" value={lead.interest_type} />
            <Info label="Origem" value={lead.source} />
            <Info label="Corretor responsável" value={broker?.name ?? "—"} />
          </div>
          {lead.general_notes && (
            <div>
              <div className="text-xs font-medium text-muted-foreground">Observações gerais</div>
              <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{lead.general_notes}</div>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Ações</h2>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Alterar status</div>
            <Select value={lead.status_id ?? ""} onValueChange={changeStatus}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {statusesForLead.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={() => setInterOpen(true)}>
            Registrar interação
          </Button>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Histórico de interações</h2>
        <div className="space-y-3">
          {data.interactions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma interação registrada.</p>}
          {data.interactions.map((i) => (
            <div key={i.id} className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">{userName(i.user_id)}</span>
                  {" · "}
                  <span className="capitalize">{labelOf(INTERACTION_TYPES, i.interaction_type) || i.interaction_type}</span>
                  {i.interaction_result && <> · <span>{labelOf(INTERACTION_RESULTS, i.interaction_result)}</span></>}
                </div>
                <div>{formatDate(i.created_at)}</div>
              </div>
              {i.notes && <div className="mt-2 whitespace-pre-wrap text-sm">{i.notes}</div>}
              {i.next_follow_up_date && (
                <div className="mt-2 text-xs text-primary">📅 Próximo retorno: {formatDate(i.next_follow_up_date)}</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} onSaved={() => qc.invalidateQueries({ queryKey: ["lead", id] })} />
      <InteractionDialog open={interOpen} onOpenChange={setInterOpen} leadId={id} onSaved={() => qc.invalidateQueries({ queryKey: ["lead", id] })} />
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon?: any; label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">{Icon && <Icon className="size-3" />}{label}</div>
      <div className="mt-0.5 capitalize">{value || "—"}</div>
    </div>
  );
}
