import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, MessageCircle, Plus, Trash2 } from "lucide-react";
import { formatDate, labelOf, SOURCES, whatsappUrl } from "@/lib/constants";
import { BrokerCandidateFormDialog } from "@/components/BrokerCandidateFormDialog";
import { BrokerCandidateInteractionDialog } from "@/components/BrokerCandidateInteractionDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recrutamento/$id")({
  component: CandidateDetailPage,
});

function CandidateDetailPage() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);

  if (role !== "admin" && role !== "recrutador") return <p>Acesso restrito.</p>;

  const { data, isLoading } = useQuery({
    queryKey: ["broker-candidate", id],
    queryFn: async () => {
      const [cand, statuses, interactions, profiles] = await Promise.all([
        supabase.from("broker_candidates").select("*").eq("id", id).maybeSingle(),
        supabase.from("kanban_statuses").select("id,name,color").eq("kanban_type", "broker_recruitment").eq("active", true).order("position"),
        supabase.from("broker_candidate_interactions").select("*").eq("candidate_id", id).order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,name"),
      ]);
      return {
        candidate: cand.data,
        statuses: statuses.data ?? [],
        interactions: interactions.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });

  if (isLoading || !data) return <div>Carregando…</div>;
  if (!data.candidate) return <div>Candidato não encontrado.</div>;

  const c = data.candidate;
  const profileName = (uid: string) => data.profiles.find((p) => p.id === uid)?.name ?? "—";

  async function updateStatus(newStatusId: string) {
    const { error } = await supabase.from("broker_candidates").update({ status_id: newStatusId }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Etapa atualizada"); qc.invalidateQueries({ queryKey: ["broker-candidate", id] }); }
  }

  async function remove() {
    if (!confirm("Excluir este candidato? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("broker_candidates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Candidato excluído"); navigate({ to: "/recrutamento" }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm"><Link to="/recrutamento"><ArrowLeft className="mr-1 size-4" />Voltar</Link></Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Edit className="mr-1 size-4" />Editar</Button>
          <Button variant="destructive" size="sm" onClick={remove}><Trash2 className="mr-1 size-4" />Excluir</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{c.name}</h1>
              {c.city && <p className="text-sm text-muted-foreground">📍 {c.city}</p>}
            </div>
            <div className="w-56">
              <Select value={c.status_id ?? ""} onValueChange={updateStatus}>
                <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
                <SelectContent>
                  {data.statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Info label="Telefone">
              {c.phone ?? "—"}
              {c.phone && (
                <a href={whatsappUrl(c.phone)} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center text-emerald-600">
                  <MessageCircle className="size-4" />
                </a>
              )}
            </Info>
            <Info label="E-mail">{c.email ?? "—"}</Info>
            <Info label="CRECI">{c.creci ?? "—"}</Info>
            <Info label="Experiência">{c.years_experience != null ? `${c.years_experience} anos` : "—"}</Info>
            <Info label="Origem">{labelOf(SOURCES, c.source)}</Info>
            <Info label="Responsável">{c.assigned_to_user_id ? profileName(c.assigned_to_user_id) : "—"}</Info>
            <Info label="LinkedIn">
              {c.linkedin_url ? <a className="text-primary hover:underline" href={c.linkedin_url} target="_blank" rel="noreferrer">Abrir</a> : "—"}
            </Info>
            <Info label="Currículo">
              {c.resume_url ? <a className="text-primary hover:underline" href={c.resume_url} target="_blank" rel="noreferrer">Abrir</a> : "—"}
            </Info>
            <Info label="Cadastrado em">{formatDate(c.created_at)}</Info>
          </div>

          {c.general_notes && (
            <div className="mt-4">
              <div className="text-xs text-muted-foreground">Observações</div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{c.general_notes}</div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Histórico</h2>
            <Button size="sm" onClick={() => setInteractionOpen(true)}><Plus className="mr-1 size-4" />Interação</Button>
          </div>
          <div className="mt-3 space-y-3">
            {data.interactions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma interação registrada.</p>}
            {data.interactions.map((i) => (
              <div key={i.id} className="border-l-2 border-primary/40 pl-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{i.interaction_type}</Badge>
                  <span>{formatDate(i.created_at)}</span>
                </div>
                {i.notes && <div className="mt-1 whitespace-pre-wrap text-sm">{i.notes}</div>}
                <div className="text-[11px] text-muted-foreground">por {profileName(i.user_id)}</div>
                {i.next_follow_up_date && <div className="text-[11px] text-primary">📅 Follow-up: {formatDate(i.next_follow_up_date)}</div>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <BrokerCandidateFormDialog open={editOpen} onOpenChange={setEditOpen} candidate={c} />
      <BrokerCandidateInteractionDialog open={interactionOpen} onOpenChange={setInteractionOpen} candidateId={id} />
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
