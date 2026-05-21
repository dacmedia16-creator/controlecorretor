import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SOURCES } from "@/lib/constants";
import { toast } from "sonner";

type Candidate = {
  id?: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  creci: string | null;
  years_experience: number | null;
  linkedin_url: string | null;
  resume_url: string | null;
  source: string | null;
  status_id: string | null;
  general_notes: string | null;
  assigned_to_user_id?: string | null;
};

const empty: Candidate = {
  name: "", email: "", phone: "", city: "", creci: "",
  years_experience: null, linkedin_url: "", resume_url: "",
  source: null, status_id: null, general_notes: "",
  assigned_to_user_id: null,
};

export function BrokerCandidateFormDialog({
  open, onOpenChange, candidate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidate?: Candidate | null;
}) {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [form, setForm] = useState<Candidate>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(candidate ? { ...candidate } : empty);
  }, [open, candidate]);

  const { data: statuses } = useQuery({
    queryKey: ["broker-statuses-form"],
    queryFn: async () =>
      (await supabase
        .from("kanban_statuses")
        .select("id,name")
        .eq("kanban_type", "broker_recruitment")
        .eq("active", true)
        .order("position")).data ?? [],
  });

  async function save() {
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      city: form.city || null,
      creci: form.creci || null,
      years_experience: form.years_experience,
      linkedin_url: form.linkedin_url || null,
      resume_url: form.resume_url || null,
      source: form.source || null,
      status_id: form.status_id || (statuses?.[0]?.id ?? null),
      general_notes: form.general_notes || null,
    };
    let error;
    if (candidate?.id) {
      ({ error } = await supabase.from("broker_candidates").update(payload).eq("id", candidate.id));
    } else {
      payload.created_by_user_id = user?.id;
      ({ error } = await supabase.from("broker_candidates").insert(payload));
    }
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(candidate?.id ? "Candidato atualizado" : "Candidato cadastrado");
      qc.invalidateQueries({ queryKey: ["broker-candidates"] });
      qc.invalidateQueries({ queryKey: ["broker-kanban"] });
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{candidate?.id ? "Editar candidato" : "Novo candidato a corretor"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label>CRECI</Label>
            <Input value={form.creci ?? ""} onChange={(e) => setForm({ ...form, creci: e.target.value })} />
          </div>
          <div>
            <Label>Anos de experiência</Label>
            <Input
              type="number"
              min={0}
              value={form.years_experience ?? ""}
              onChange={(e) => setForm({ ...form, years_experience: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Origem</Label>
            <Select value={form.source ?? ""} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>LinkedIn</Label>
            <Input value={form.linkedin_url ?? ""} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <Label>Currículo (URL)</Label>
            <Input value={form.resume_url ?? ""} onChange={(e) => setForm({ ...form, resume_url: e.target.value })} placeholder="https://..." />
          </div>
          <div className="md:col-span-2">
            <Label>Etapa</Label>
            <Select value={form.status_id ?? ""} onValueChange={(v) => setForm({ ...form, status_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(statuses ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.general_notes ?? ""} onChange={(e) => setForm({ ...form, general_notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
