import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { INTERACTION_RESULTS, INTERACTION_TYPES } from "@/lib/constants";
import { toast } from "sonner";

export function InteractionDialog({
  open, onOpenChange, leadId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [type, setType] = useState("ligacao");
  const [result, setResult] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("lead_interactions").insert({
      lead_id: leadId,
      user_id: user!.id,
      interaction_type: type,
      interaction_result: result,
      notes: notes || null,
      next_follow_up_date: next ? new Date(next).toISOString() : null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Interação registrada");
    setNotes(""); setNext(""); setResult(null);
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar interação</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{INTERACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Resultado</Label>
            <Select value={result ?? "__none"} onValueChange={(v) => setResult(v === "__none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {INTERACTION_RESULTS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>Próximo retorno</Label>
            <Input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} />
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
