import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type NewRole = "corretor" | "recrutador";

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
  const recruiters = data.profiles.filter((p) => data.roles.some((r) => r.user_id === p.id && r.role === "recrutador"));

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from("profiles").update({ active }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(active ? "Ativado" : "Desativado"); qc.invalidateQueries({ queryKey: ["brokers"] }); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">{brokers.length} corretor(es) · {recruiters.length} recrutador(es)</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>Novo usuário</Button>
      </div>

      <Tabs defaultValue="corretores">
        <TabsList>
          <TabsTrigger value="corretores">Corretores</TabsTrigger>
          <TabsTrigger value="recrutadores">Recrutadores</TabsTrigger>
        </TabsList>
        <TabsContent value="corretores">
          <UserTable
            users={brokers}
            leads={data.leads}
            showLeads
            onToggle={toggleActive}
            onEdit={(b) => { setEditing(b); setOpen(true); }}
          />
        </TabsContent>
        <TabsContent value="recrutadores">
          <UserTable
            users={recruiters}
            leads={[]}
            showLeads={false}
            onToggle={toggleActive}
            onEdit={(b) => { setEditing(b); setOpen(true); }}
          />
        </TabsContent>
      </Tabs>

      <UserDialog
        open={open}
        onOpenChange={setOpen}
        user={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["brokers"] })}
      />
    </div>
  );
}

function UserTable({
  users, leads, showLeads, onToggle, onEdit,
}: {
  users: any[]; leads: any[]; showLeads: boolean;
  onToggle: (id: string, active: boolean) => void;
  onEdit: (u: any) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2">Nome</th>
            <th className="px-3 py-2">E-mail</th>
            <th className="px-3 py-2">Telefone</th>
            {showLeads && <th className="px-3 py-2">Leads</th>}
            <th className="px-3 py-2">Ativo</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((b) => {
            const my = leads.filter((l) => l.assigned_to_user_id === b.id);
            return (
              <tr key={b.id} className="border-t">
                <td className="px-3 py-2 font-medium">{b.name}</td>
                <td className="px-3 py-2">{b.email}</td>
                <td className="px-3 py-2">{b.phone ?? "—"}</td>
                {showLeads && <td className="px-3 py-2"><Badge variant="secondary">{my.length}</Badge></td>}
                <td className="px-3 py-2">
                  <Switch checked={b.active} onCheckedChange={(v) => onToggle(b.id, v)} />
                </td>
                <td className="px-3 py-2">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(b)}>Editar</Button>
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr><td colSpan={showLeads ? 6 : 5} className="py-8 text-center text-muted-foreground">Nenhum usuário cadastrado.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function UserDialog({
  open, onOpenChange, user, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; user: any; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<NewRole>("corretor");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(user?.name ?? "");
      setEmail(user?.email ?? "");
      setPhone(user?.phone ?? "");
      setPassword("");
      setNewRole("corretor");
    }
  }, [open, user]);

  async function save() {
    setBusy(true);
    if (user?.id) {
      const { error } = await supabase.from("profiles").update({ name, phone }).eq("id", user.id);
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success("Usuário atualizado");
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { name, phone, role: newRole },
        },
      });
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success(
        newRole === "recrutador"
          ? "Recrutador cadastrado. Ele receberá um e-mail de confirmação."
          : "Corretor cadastrado. Ele receberá um e-mail de confirmação.",
      );
    }
    setBusy(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{user?.id ? "Editar usuário" : "Novo usuário"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!user?.id} /></div>
          <div><Label>Telefone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          {!user?.id && (
            <>
              <div>
                <Label>Perfil</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as NewRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corretor">Corretor</SelectItem>
                    <SelectItem value="recrutador">Recrutador</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Recrutador só acessa o módulo de Recrutamento de Corretores.
                </p>
              </div>
              <div>
                <Label>Senha provisória</Label>
                <Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">O usuário poderá trocar depois.</p>
              </div>
            </>
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
