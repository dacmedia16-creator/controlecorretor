export const INTEREST_TYPES = [
  { value: "comprar", label: "Comprar" },
  { value: "vender", label: "Vender" },
  { value: "alugar", label: "Alugar" },
  { value: "captar", label: "Captar imóvel" },
  { value: "outro", label: "Outro" },
];

export const PROPERTY_TYPES = [
  { value: "apartamento", label: "Apartamento" },
  { value: "casa", label: "Casa" },
  { value: "terreno", label: "Terreno" },
  { value: "comercial", label: "Comercial" },
  { value: "rural", label: "Rural" },
  { value: "outro", label: "Outro" },
];

export const SOURCES = [
  { value: "site", label: "Site" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "indicacao", label: "Indicação" },
  { value: "portal", label: "Portal imobiliário" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "outro", label: "Outro" },
];

export const INTERACTION_TYPES = [
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "reuniao", label: "Reunião" },
  { value: "observacao", label: "Observação" },
];

export const INTERACTION_RESULTS = [
  { value: "atendeu", label: "Atendeu" },
  { value: "nao_atendeu", label: "Não atendeu" },
  { value: "pediu_retorno", label: "Pediu retorno" },
  { value: "interessado", label: "Interessado" },
  { value: "sem_interesse", label: "Sem interesse" },
  { value: "imovel_captado", label: "Imóvel captado" },
];

export function whatsappUrl(phone: string | null | undefined) {
  if (!phone) return "#";
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function labelOf(list: { value: string; label: string }[], v: string | null | undefined) {
  if (!v) return "—";
  return list.find((x) => x.value === v)?.label ?? v;
}
