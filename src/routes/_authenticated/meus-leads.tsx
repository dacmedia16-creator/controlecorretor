import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MessageCircle, Phone, ExternalLink } from "lucide-react";
import { LeadFormDialog } from "@/components/LeadFormDialog";
import { InteractionDialog } from "@/components/InteractionDialog";
import { whatsappUrl } from "@/lib/constants";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/meus-leads")({
  component: MyLeadsPage,
});

function MyLeadsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [interLeadId, setInterLeadId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-leads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [leads, statuses] = await Promise.all([
        supabase.from("leads").select("*").or(`assigned_to_user_id.eq.${user!.id},created_by_user_id.eq.${user!.id}`).order("updated_at", { ascending: false }),
        supabase.from("kanban_statuses").select("id,name,color,kanban_type").eq("active", true).order("position"),
      ]);
      return { leads: leads.data ?? [], statuses: statuses.data ?? [] };
    },
  });

  async function changeStatus(leadId: string, statusId: string) {
    const { error } = await supabase.from("leads").update({ status_id: statusId }).eq("id", leadId);
    if (error) toast.error(error.message);
    else { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["my-leads", user?.id] }); }
  }

  if (isLoading || !data) return <div>Carregando…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meus Leads</h1>
          <p className="text-sm text-muted-foreground">{data.leads.length} leads</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 size-4" />Novo lead</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.leads.map((l) => {
          const st = data.statuses.find((s) => s.id === l.status_id);
          return (
            <Card key={l.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <Link to="/leads/$id" params={{ id: l.id }} className="font-semibold hover:text-primary">{l.name}</Link>
                  {l.phone && <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" />{l.phone}</div>}
                  {l.city && <div className="text-xs text-muted-foreground">{l.city} {l.neighborhood && `/ ${l.neighborhood}`}</div>}
                </div>
                {st && <Badge style={{ backgroundColor: st.color, color: "white" }}>{st.name}</Badge>}
              </div>

              <Select value={l.status_id ?? ""} onValueChange={(v) => changeStatus(l.id, v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {data.statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                {l.phone && (
                  <a href={whatsappUrl(l.phone)} target="_blank" rel="noreferrer" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full"><MessageCircle className="mr-1 size-4" />WhatsApp</Button>
                  </a>
                )}
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setInterLeadId(l.id)}>Interação</Button>
                <Link to="/leads/$id" params={{ id: l.id }}>
                  <Button variant="ghost" size="icon"><ExternalLink className="size-4" /></Button>
                </Link>
              </div>
            </Card>
          );
        })}
        {data.leads.length === 0 && <p className="text-muted-foreground">Você ainda não tem leads. Cadastre um para começar.</p>}
      </div>

      <LeadFormDialog open={open} onOpenChange={setOpen} onSaved={() => qc.invalidateQueries({ queryKey: ["my-leads", user?.id] })} />
      {interLeadId && (
        <InteractionDialog
          open={!!interLeadId}
          onOpenChange={(v) => !v && setInterLeadId(null)}
          leadId={interLeadId}
          onSaved={() => qc.invalidateQueries({ queryKey: ["my-leads", user?.id] })}
        />
      )}
    </div>
  );
}
