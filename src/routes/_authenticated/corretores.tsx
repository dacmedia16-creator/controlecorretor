import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/corretores")({
  component: BrokersPage,
});

function BrokersPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["brokers"],
    queryFn: async () => {
      const [profiles, roles, leads] = await Promise.all([
        supabase.from("profiles").select("*").order("name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("leads").select("id, assigned_to_user_id, status_id"),
      ]);
      return { profiles: profiles.data ?? [], roles: roles.data ?? [], leads: leads.data ?? [] };
    },
  });

  if (role !== "admin") return <p>Acesso restrito.</p>;
  if (isLoading || !data) return <div>Carregando…</div>;

  const brokers = data.profiles.filter((p) => data.roles.some((r) => r.user_id === p.id && r.role === "corretor"));

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from("profiles").update({ active }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(active ? "Ativado" : "Desativado"); qc.invalidateQueries({ queryKey: ["brokers"] }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Corretores</h1>
          <p className="text-sm text-muted-foreground">{brokers.length} cadastrados</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>Novo corretor</Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">E-mail</th>
              <th className="px-3 py-2">Telefone</th>
              <th className="px-3 py-2">Leads</th>
              <th className="px-3 py-2">Ativo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {brokers.map((b) => {
              const my = data.leads.filter((l) => l.assigned_to_user_id === b.id);
              return (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{b.name}</td>
                  <td className="px-3 py-2">{b.email}</td>
                  <td className="px-3 py-2">{b.phone ?? "—"}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{my.length}</Badge></td>
                  <td className="px-3 py-2">
                    <Switch checked={b.active} onCheckedChange={(v) => toggleActive(b.id, v)} />
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(b); setOpen(true); }}>Editar</Button>
                  </td>
                </tr>
              );
            })}
            {brokers.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum corretor cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <BrokerDialog open={open} onOpenChange={setOpen} broker={editing} onSaved={() => qc.invalidateQueries({ queryKey: ["brokers"] })} />
    </div>
  );
}

function BrokerDialog({ open, onOpenChange, broker, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; broker: any; onSaved: () => void }) {
  const [name, setName] = useState(broker?.name ?? "");
  const [email, setEmail] = useState(broker?.email ?? "");
  const [phone, setPhone] = useState(broker?.phone ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // reset on open
  useState(() => {
    setName(broker?.name ?? ""); setEmail(broker?.email ?? ""); setPhone(broker?.phone ?? ""); setPassword("");
    return undefined;
  });

  async function save() {
    setBusy(true);
    if (broker?.id) {
      const { error } = await supabase.from("profiles").update({ name, phone }).eq("id", broker.id);
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success("Corretor atualizado");
    } else {
      // Sign up new broker - they will be created with corretor role automatically (since admin already exists)
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/`, data: { name, phone } },
      });
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success("Corretor cadastrado. Ele receberá um e-mail de confirmação.");
    }
    setBusy(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{broker?.id ? "Editar corretor" : "Novo corretor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!broker?.id} /></div>
          <div><Label>Telefone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          {!broker?.id && (
            <div>
              <Label>Senha provisória</Label>
              <Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">O corretor poderá trocar depois.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
