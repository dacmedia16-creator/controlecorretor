import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INTEREST_TYPES, PROPERTY_TYPES, SOURCES } from "@/lib/constants";
import { toast } from "sonner";

type Lead = {
  id?: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  neighborhood: string | null;
  property_type: string | null;
  interest_type: string | null;
  source: string | null;
  assigned_to_user_id: string | null;
  status_id: string | null;
  general_notes: string | null;
};

const empty: Lead = {
  name: "", phone: "", email: "", city: "", neighborhood: "",
  property_type: null, interest_type: null, source: null,
  assigned_to_user_id: null, status_id: null, general_notes: "",
};

export function LeadFormDialog({
  open, onOpenChange, lead, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead?: Lead | null;
  onSaved: () => void;
}) {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const [form, setForm] = useState<Lead>(empty);
  const [brokers, setBrokers] = useState<{ id: string; name: string }[]>([]);
  const [statuses, setStatuses] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(lead ? { ...empty, ...lead } : empty);
  }, [lead, open]);

  useEffect(() => {
    if (!open) return;
    supabase.from("kanban_statuses").select("id,name,position").eq("active", true).order("position")
      .then(({ data }) => setStatuses(data ?? []));
    if (isAdmin) {
      supabase.from("profiles").select("id,name").eq("active", true).order("name")
        .then(({ data }) => setBrokers(data ?? []));
    }
  }, [open, isAdmin]);

  function update<K extends keyof Lead>(k: K, v: Lead[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone || null,
      email: form.email || null,
      city: form.city || null,
      neighborhood: form.neighborhood || null,
      property_type: form.property_type,
      interest_type: form.interest_type,
      source: form.source,
      assigned_to_user_id: isAdmin ? form.assigned_to_user_id : (lead?.assigned_to_user_id ?? user!.id),
      status_id: form.status_id ?? statuses[0]?.id ?? null,
      general_notes: form.general_notes || null,
    };
    if (lead?.id) {
      const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success("Lead atualizado");
    } else {
      const { error } = await supabase.from("leads").insert({ ...payload, created_by_user_id: user!.id });
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success("Lead criado");
    }
    setBusy(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead?.id ? "Editar lead" : "Novo lead"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome *"><Input value={form.name} onChange={(e) => update("name", e.target.value)} /></Field>
          <Field label="Telefone"><Input value={form.phone ?? ""} onChange={(e) => update("phone", e.target.value)} /></Field>
          <Field label="E-mail"><Input type="email" value={form.email ?? ""} onChange={(e) => update("email", e.target.value)} /></Field>
          <Field label="Cidade"><Input value={form.city ?? ""} onChange={(e) => update("city", e.target.value)} /></Field>
          <Field label="Bairro"><Input value={form.neighborhood ?? ""} onChange={(e) => update("neighborhood", e.target.value)} /></Field>
          <Field label="Tipo de imóvel">
            <SelectVal value={form.property_type} onChange={(v) => update("property_type", v)} options={PROPERTY_TYPES} />
          </Field>
          <Field label="Tipo de interesse">
            <SelectVal value={form.interest_type} onChange={(v) => update("interest_type", v)} options={INTEREST_TYPES} />
          </Field>
          <Field label="Origem">
            <SelectVal value={form.source} onChange={(v) => update("source", v)} options={SOURCES} />
          </Field>
          <Field label="Status">
            <SelectVal value={form.status_id} onChange={(v) => update("status_id", v)} options={statuses.map((s) => ({ value: s.id, label: s.name }))} />
          </Field>
          {isAdmin && (
            <Field label="Corretor responsável">
              <SelectVal value={form.assigned_to_user_id} onChange={(v) => update("assigned_to_user_id", v)} options={brokers.map((b) => ({ value: b.id, label: b.name }))} allowNone />
            </Field>
          )}
          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.general_notes ?? ""} onChange={(e) => update("general_notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SelectVal({
  value, onChange, options, allowNone,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
  allowNone?: boolean;
}) {
  return (
    <Select value={value ?? "__none"} onValueChange={(v) => onChange(v === "__none" ? null : v)}>
      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value="__none">— Sem responsável —</SelectItem>}
        {!allowNone && <SelectItem value="__none">—</SelectItem>}
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
