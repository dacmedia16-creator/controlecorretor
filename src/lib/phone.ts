// Utilitários para parsing/validação de telefones brasileiros e CSV simples.

export type PhoneStatus = "valid" | "invalid";

/** Remove tudo que não é dígito e tira o prefixo 55 quando aplicável. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits;
}

/** Valida número brasileiro: 10 ou 11 dígitos, com DDD plausível (11-99). */
export function validateBrazilianPhone(normalized: string): PhoneStatus {
  if (!normalized) return "invalid";
  if (normalized.length !== 10 && normalized.length !== 11) return "invalid";
  const ddd = parseInt(normalized.slice(0, 2), 10);
  if (isNaN(ddd) || ddd < 11 || ddd > 99) return "invalid";
  // celular (11 dígitos) deve começar com 9 no terceiro dígito
  if (normalized.length === 11 && normalized[2] !== "9") return "invalid";
  return "valid";
}

/** Formata para exibição: (11) 99999-9999 ou (11) 9999-9999. */
export function formatPhoneDisplay(normalized: string): string {
  if (!normalized) return "";
  if (normalized.length === 11) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 7)}-${normalized.slice(7)}`;
  }
  if (normalized.length === 10) {
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 6)}-${normalized.slice(6)}`;
  }
  return normalized;
}

export function whatsappLink(normalized: string): string {
  return `https://wa.me/55${normalized}`;
}

export type ParsedContact = {
  rawLine: string;
  name: string;
  rawPhone: string;
  normalized: string;
  city?: string;
  neighborhood?: string;
  source?: string;
  notes?: string;
};

/** Heurística para uma linha de texto livre. */
export function parseContactLine(line: string): ParsedContact | null {
  const clean = line.trim();
  if (!clean) return null;

  // Capturar todos os blocos numéricos e juntar
  const phoneMatches = clean.match(/[\d\s().+-]{8,}/g) ?? [];
  if (phoneMatches.length === 0) return { rawLine: clean, name: "", rawPhone: "", normalized: "" };

  // Pegar o último (mais provável de ser o telefone)
  const rawPhone = phoneMatches[phoneMatches.length - 1].trim();
  const normalized = normalizePhone(rawPhone);

  // Nome: tudo antes do telefone, removendo separadores
  const idx = clean.lastIndexOf(rawPhone);
  let name = clean.slice(0, idx).replace(/[-,|:;]+\s*$/g, "").trim();
  // remove parêntese órfão
  name = name.replace(/\s+$/g, "");

  return { rawLine: clean, name, rawPhone, normalized };
}

/** CSV simples (separador vírgula ou ponto-vírgula), respeita aspas. */
export function parseCsv(text: string): ParsedContact[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const header = parseCsvLine(lines[0], sep).map((h) => h.trim().toLowerCase());

  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const iName = idx(["nome", "name"]);
  const iPhone = idx(["telefone", "phone", "whatsapp", "celular"]);
  const iCity = idx(["cidade", "city"]);
  const iNeighborhood = idx(["bairro", "neighborhood"]);
  const iSource = idx(["origem", "source"]);
  const iNotes = idx(["observacoes", "observações", "notes", "obs"]);

  const out: ParsedContact[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li], sep);
    const rawPhone = iPhone >= 0 ? (cols[iPhone] ?? "") : "";
    const normalized = normalizePhone(rawPhone);
    out.push({
      rawLine: lines[li],
      name: iName >= 0 ? (cols[iName] ?? "").trim() : "",
      rawPhone,
      normalized,
      city: iCity >= 0 ? (cols[iCity] ?? "").trim() : undefined,
      neighborhood: iNeighborhood >= 0 ? (cols[iNeighborhood] ?? "").trim() : undefined,
      source: iSource >= 0 ? (cols[iSource] ?? "").trim() : undefined,
      notes: iNotes >= 0 ? (cols[iNotes] ?? "").trim() : undefined,
    });
  }
  return out;
}

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
