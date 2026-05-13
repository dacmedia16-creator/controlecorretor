import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, Save, Eye, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  type ParsedContact,
  formatPhoneDisplay,
  parseContactLine,
  parseCsv,
  validateBrazilianPhone,
} from "@/lib/phone";
import { formatDate } from "@/lib/constants";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const MAX_ROWS = 10000;
const MIN_BATCH_NAME = 3;
const MAX_BATCH_NAME = 200;
const CONFIRM_THRESHOLD = 100;

export const Route = createFileRoute("/_authenticated/leads-em-massa")({
  component: BulkLeadsPage,
});

type PreviewRow = ParsedContact & {
  status: "valid" | "invalid" | "duplicate";
  reason?: string;
  selected: boolean;
};

function BulkLeadsPage() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [batchName, setBatchName] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: batches } = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const [b, p] = await Promise.all([
        supabase.from("lead_import_batches").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,name"),
      ]);
      return { batches: b.data ?? [], profiles: p.data ?? [] };
    },
  });

  if (role !== "admin") return <p className="text-muted-foreground">Acesso restrito ao administrador.</p>;

  async function buildPreview(rows: ParsedContact[]) {
    if (rows.length > MAX_ROWS) {
      toast.error(`Limite de ${MAX_ROWS.toLocaleString("pt-BR")} linhas por importação. Divida o arquivo.`);
      return;
    }
    setScanning(true);
    try {
      const seen = new Set<string>();
      const phones = Array.from(new Set(rows.map((r) => r.normalized).filter(Boolean)));

      // Verifica duplicados no banco em chunks, cedendo o thread entre eles
      const existing = new Set<string>();
      for (let i = 0; i < phones.length; i += 200) {
        const chunk = phones.slice(i, i + 200);
        const { data, error } = await supabase
          .from("leads")
          .select("phone_normalized")
          .in("phone_normalized", chunk);
        if (error) throw error;
        (data ?? []).forEach((r: any) => r.phone_normalized && existing.add(r.phone_normalized));
        await new Promise((r) => setTimeout(r, 0));
      }

      const result: PreviewRow[] = rows.map((r) => {
        const v = validateBrazilianPhone(r.normalized);
        if (v === "invalid") {
          return { ...r, status: "invalid", reason: "Telefone inválido", selected: false };
        }
        if (existing.has(r.normalized)) {
          return { ...r, status: "duplicate", reason: "Já existe na base", selected: false };
        }
        if (seen.has(r.normalized)) {
          return { ...r, status: "duplicate", reason: "Repetido na lista", selected: false };
        }
        seen.add(r.normalized);
        return { ...r, status: "valid", selected: true };
      });

      setPreview(result);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao processar lista");
    } finally {
      setScanning(false);
    }
  }

  async function handleProcessText() {
    const lines = text.split(/\r?\n/);
    if (lines.length > MAX_ROWS) {
      toast.error(`Máximo ${MAX_ROWS.toLocaleString("pt-BR")} linhas por vez.`);
      return;
    }
    const parsed = lines.map(parseContactLine).filter((x): x is ParsedContact => !!x);
    if (parsed.length === 0) {
      toast.error("Nenhuma linha encontrada");
      return;
    }
    await buildPreview(parsed);
    toast.success(`${parsed.length.toLocaleString("pt-BR")} linhas processadas`);
  }

  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 5MB)");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const content = await file.text();
    const parsed = parseCsv(content);
    if (parsed.length === 0) {
      toast.error("CSV vazio ou inválido");
      return;
    }
    await buildPreview(parsed);
    toast.success(`${parsed.length.toLocaleString("pt-BR")} linhas do CSV processadas`);
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleRow(i: number) {
    setPreview((p) => p && p.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)));
  }

  function toggleAll(checked: boolean) {
    setPreview((p) => p && p.map((r) => (r.status === "valid" ? { ...r, selected: checked } : r)));
  }

  const summary = useMemo(() => {
    if (!preview) return null;
    return {
      total: preview.length,
      valid: preview.filter((r) => r.status === "valid").length,
      invalid: preview.filter((r) => r.status === "invalid").length,
      duplicate: preview.filter((r) => r.status === "duplicate").length,
      selected: preview.filter((r) => r.selected).length,
    };
  }, [preview]);

  function handleSaveClick() {
    if (!preview || !user) return;
    const trimmed = batchName.trim();
    if (trimmed.length < MIN_BATCH_NAME) {
      toast.error(`O nome do lote precisa ter pelo menos ${MIN_BATCH_NAME} caracteres`);
      return;
    }
    if (trimmed.length > MAX_BATCH_NAME) {
      toast.error(`O nome do lote deve ter no máximo ${MAX_BATCH_NAME} caracteres`);
      return;
    }
    const toImport = preview.filter((r) => r.selected && r.status === "valid");
    if (toImport.length === 0) {
      toast.error("Nenhum lead válido selecionado");
      return;
    }
    if (toImport.length >= CONFIRM_THRESHOLD) {
      setConfirmOpen(true);
    } else {
      void handleSave();
    }
  }

  async function handleSave() {
    setConfirmOpen(false);
    if (!preview || !user) return;
    const toImport = preview.filter((r) => r.selected && r.status === "valid");
    if (toImport.length === 0) return;

    setSaving(true);
    setProgress({ done: 0, total: toImport.length });
    try {
      const { data: statuses } = await supabase
        .from("kanban_statuses")
        .select("id,name,position")
        .eq("active", true)
        .eq("kanban_type", "bulk_leads")
        .order("position");
      const novoLead =
        statuses?.find((s) => s.name === "Novo contato em massa") ??
        statuses?.find((s) => s.name.toLowerCase().includes("novo")) ??
        statuses?.[0] ?? null;

      const { data: batch, error: bErr } = await supabase
        .from("lead_import_batches")
        .insert({
          name: batchName.trim(),
          total_rows: summary?.total ?? 0,
          valid_count: summary?.valid ?? 0,
          invalid_count: summary?.invalid ?? 0,
          duplicate_count: summary?.duplicate ?? 0,
          imported_count: 0,
          created_by_user_id: user.id,
        })
        .select()
        .single();
      if (bErr || !batch) throw bErr ?? new Error("Falha ao criar lote");

      const rows = toImport.map((r) => ({
        name: (r.name?.trim() || "Lead sem nome").slice(0, 200),
        phone: r.normalized,
        city: r.city ? r.city.slice(0, 120) : null,
        neighborhood: r.neighborhood ? r.neighborhood.slice(0, 120) : null,
        source: (r.source || "Importação em massa").slice(0, 120),
        general_notes: r.notes ? r.notes.slice(0, 1000) : null,
        status_id: novoLead?.id ?? null,
        created_by_user_id: user.id,
        import_batch_id: batch.id,
      }));

      let imported = 0;
      const CHUNK = 250;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error, count } = await supabase.from("leads").insert(chunk, { count: "exact" });
        if (error) throw error;
        imported += count ?? chunk.length;
        setProgress({ done: imported, total: rows.length });
        await new Promise((r) => setTimeout(r, 0));
      }

      await supabase
        .from("lead_import_batches")
        .update({ imported_count: imported })
        .eq("id", batch.id);

      toast.success(`${imported.toLocaleString("pt-BR")} leads importados com sucesso`);
      qc.invalidateQueries({ queryKey: ["import-batches"] });
      qc.invalidateQueries({ queryKey: ["leads-admin"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setPreview(null);
      setText("");
      setBatchName("");
      navigate({ to: "/leads-em-massa/$batchId", params: { batchId: batch.id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads em Massa</h1>
        <p className="text-sm text-muted-foreground">
          Importe listas de contatos e distribua para os corretores.
        </p>
      </div>

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import"><Upload className="mr-2 size-4" />Importar</TabsTrigger>
          <TabsTrigger value="batches"><ListChecks className="mr-2 size-4" />Lotes ({batches?.batches.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <Card className="space-y-3 p-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Nome do lote *</label>
              <Input
                placeholder="Ex.: Lista captação Zona Sul Maio"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Colar lista de contatos</label>
                <Textarea
                  rows={10}
                  placeholder={`Aceita vários formatos, um por linha:\n11999999999\n(11) 99999-9999\n+55 11 99999-9999\nJoão - 11999999999\nMaria, 21988887777`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <Button className="mt-2" onClick={handleProcessText} disabled={!text.trim() || scanning}>
                  {scanning ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Eye className="mr-2 size-4" />}
                  {scanning ? "Verificando…" : "Processar lista"}
                </Button>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Importar arquivo CSV</label>
                <div className="flex h-[calc(100%-1.75rem)] flex-col items-center justify-center rounded-md border border-dashed p-6 text-center">
                  <FileText className="mb-2 size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Colunas suportadas: nome, telefone, cidade, bairro, origem, observacoes
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsv}
                  />
                  <Button variant="outline" className="mt-3" onClick={() => fileRef.current?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar CSV
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {summary && preview && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <SummaryCard label="Linhas" value={summary.total} />
                <SummaryCard label="Válidos" value={summary.valid} tone="ok" />
                <SummaryCard label="Inválidos" value={summary.invalid} tone="warn" />
                <SummaryCard label="Duplicados" value={summary.duplicate} tone="muted" />
                <SummaryCard label="Selecionados" value={summary.selected} tone="primary" />
              </div>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={summary.selected > 0 && summary.selected === summary.valid}
                      onCheckedChange={(c) => toggleAll(!!c)}
                    />
                    <span className="text-sm">Selecionar todos os válidos</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {progress && (
                      <span className="text-xs text-muted-foreground">
                        {progress.done.toLocaleString("pt-BR")} / {progress.total.toLocaleString("pt-BR")}
                      </span>
                    )}
                    <Button onClick={handleSaveClick} disabled={saving || summary.selected === 0}>
                      {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                      {saving ? "Importando…" : `Importar ${summary.selected} leads`}
                    </Button>
                  </div>
                </div>
                <div className="max-h-[480px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50 text-left">
                      <tr>
                        <th className="px-3 py-2 w-10"></th>
                        <th className="px-3 py-2">Nome</th>
                        <th className="px-3 py-2">Telefone original</th>
                        <th className="px-3 py-2">Padronizado</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={r.selected}
                              disabled={r.status !== "valid"}
                              onCheckedChange={() => toggleRow(i)}
                            />
                          </td>
                          <td className="px-3 py-2">{r.name || <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.rawPhone || r.rawLine}</td>
                          <td className="px-3 py-2">{r.normalized ? formatPhoneDisplay(r.normalized) : "—"}</td>
                          <td className="px-3 py-2">
                            {r.status === "valid" && <Badge className="bg-emerald-600">Válido</Badge>}
                            {r.status === "invalid" && <Badge variant="destructive">Inválido</Badge>}
                            {r.status === "duplicate" && <Badge variant="secondary">Duplicado</Badge>}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.reason ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="batches">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Lote</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Linhas</th>
                  <th className="px-3 py-2">Importados</th>
                  <th className="px-3 py-2">Inválidos</th>
                  <th className="px-3 py-2">Duplicados</th>
                  <th className="px-3 py-2">Criado por</th>
                </tr>
              </thead>
              <tbody>
                {(batches?.batches ?? []).map((b: any) => (
                  <tr key={b.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">
                      <Link to="/leads-em-massa/$batchId" params={{ batchId: b.id }} className="hover:text-primary">
                        {b.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(b.created_at)}</td>
                    <td className="px-3 py-2">{b.total_rows}</td>
                    <td className="px-3 py-2">{b.imported_count}</td>
                    <td className="px-3 py-2">{b.invalid_count}</td>
                    <td className="px-3 py-2">{b.duplicate_count}</td>
                    <td className="px-3 py-2 text-xs">
                      {batches?.profiles.find((p: any) => p.id === b.created_by_user_id)?.name ?? "—"}
                    </td>
                  </tr>
                ))}
                {(batches?.batches ?? []).length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum lote importado ainda</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar importação"
        description={
          <span>
            Você está prestes a importar{" "}
            <strong>{summary?.selected.toLocaleString("pt-BR") ?? 0}</strong> leads no lote{" "}
            <strong>"{batchName.trim()}"</strong>. Confirme antes de prosseguir.
          </span>
        }
        confirmLabel="Importar"
        loading={saving}
        onConfirm={handleSave}
      />
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "muted" | "primary" }) {
  const color =
    tone === "ok" ? "text-emerald-600" :
    tone === "warn" ? "text-destructive" :
    tone === "muted" ? "text-muted-foreground" :
    tone === "primary" ? "text-primary" : "";
  return (
    <Card className="p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${color}`}>{value}</div>
    </Card>
  );
}
