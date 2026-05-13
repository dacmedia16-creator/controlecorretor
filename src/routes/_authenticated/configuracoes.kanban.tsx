import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes/kanban")({
  component: KanbanSettingsPage,
});

function KanbanSettingsPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");

  const { data, isLoading } = useQuery({
    queryKey: ["statuses-admin"],
    queryFn: async () => (await supabase.from("kanban_statuses").select("*").order("position")).data ?? [],
  });

  if (role !== "admin") return <p>Acesso restrito.</p>;
  if (isLoading || !data) return <div>Carregando…</div>;
  const list = data;

  async function update(id: string, fields: any) {
    const { error } = await supabase.from("kanban_statuses").update(fields).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["statuses-admin"] });
  }

  async function move(idx: number, dir: -1 | 1) {
    const a = data[idx], b = data[idx + dir];
    if (!a || !b) return;
    await Promise.all([
      supabase.from("kanban_statuses").update({ position: b.position }).eq("id", a.id),
      supabase.from("kanban_statuses").update({ position: a.position }).eq("id", b.id),
    ]);
    qc.invalidateQueries({ queryKey: ["statuses-admin"] });
  }

  async function add() {
    if (!name.trim()) return;
    const maxPos = Math.max(0, ...data.map((s) => s.position));
    const { error } = await supabase.from("kanban_statuses").insert({ name: name.trim(), color, position: maxPos + 1 });
    if (error) toast.error(error.message);
    else { setName(""); qc.invalidateQueries({ queryKey: ["statuses-admin"] }); }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta etapa? Leads neste status ficarão sem status.")) return;
    const { error } = await supabase.from("kanban_statuses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["statuses-admin"] });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Configurações do Kanban</h1>
        <p className="text-sm text-muted-foreground">Gerencie as etapas dos seus leads</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs">Nome da etapa</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Visita agendada" />
          </div>
          <div>
            <label className="text-xs">Cor</label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
          </div>
          <Button onClick={add}><Plus className="mr-1 size-4" />Adicionar</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 w-20">Ordem</th>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2 w-24">Cor</th>
              <th className="px-3 py-2 w-20">Ativa</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((s, idx) => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => move(idx, -1)}><ArrowUp className="size-4" /></Button>
                    <Button size="icon" variant="ghost" disabled={idx === data.length - 1} onClick={() => move(idx, 1)}><ArrowDown className="size-4" /></Button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Input defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && update(s.id, { name: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <Input type="color" defaultValue={s.color} onChange={(e) => update(s.id, { color: e.target.value })} className="h-9 w-16 p-1" />
                </td>
                <td className="px-3 py-2">
                  <Switch checked={s.active} onCheckedChange={(v) => update(s.id, { active: v })} />
                </td>
                <td className="px-3 py-2">
                  <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="size-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
