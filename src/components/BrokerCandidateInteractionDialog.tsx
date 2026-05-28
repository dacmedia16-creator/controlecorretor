import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const TYPES = [
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "entrevista", label: "Entrevista" },
  { value: "observacao", label: "Observação" },
];

export function BrokerCandidateInteractionDialog({
  open, onOpenChange, candidateId, defaultType = "ligacao",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidateId: string;
  defaultType?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [type, setType] = useState(defaultType);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setType(defaultType);
  }, [open, defaultType]);

  const isInterview = type === "entrevista";

  async function save() {
    if (!user) return;
    if (isInterview && !followUp) {
      toast.error("Informe a data e hora da entrevista");
      return;
    }
    setSaving(true);
    let finalNotes = notes.trim();
    if (isInterview && followUp) {
      const formatted = new Date(followUp).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const prefix = `Entrevista agendada para ${formatted}`;
      finalNotes = finalNotes ? `${prefix}\n${finalNotes}` : prefix;
    }
    const { error } = await supabase.from("broker_candidate_interactions").insert({
      candidate_id: candidateId,
      user_id: user.id,
      interaction_type: type,
      notes: finalNotes || null,
      next_follow_up_date: followUp || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Interação registrada");
      qc.invalidateQueries({ queryKey: ["broker-candidate", candidateId] });
      setNotes(""); setFollowUp("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar interação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>{isInterview ? "Data e hora da entrevista *" : "Próximo follow-up"}</Label>
            <Input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
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
