export const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

/** Recebe string ISO ou "AAAA-MM-DD" e devolve "DD/MM/AAAA" */
export const formatDate = (iso: string) => {
  if (!iso) return "—";
  const dateStr = iso.includes("T") ? iso.split("T")[0] : iso;
  const parts = (dateStr || "").split("-");
  if (!dateStr || parts.length !== 3) return iso || "—";

  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
};

export const formatPhone = (raw: string) => raw;

/**
 * Normaliza telefone para formato 55DDDNUMERO (somente dígitos)
 * Regras: remove símbolos, garante 55, evita duplicidade de 55.
 */
export const normalizeBrazilianPhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;

  // Remove tudo que não é dígito
  let digits = raw.replace(/\D/g, "");

  if (!digits) return null;

  // Se começar com 55 e tiver 12 ou 13 dígitos, assume que já tem o código do país
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    // OK
  } else if (digits.length === 10 || digits.length === 11) {
    // Adiciona 55 se tiver apenas DDD + Número
    digits = "55" + digits;
  } else {
    // Caso não se encaixe nos padrões básicos brasileiros
    return null;
  }

  return digits;
};

export const getWhatsAppLink = (phone: string | null | undefined, message?: string) => {
  const normalized = normalizeBrazilianPhone(phone);
  if (!normalized) return "";

  let gatewayPattern = "https://wa.me/{{phone}}";
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("fr-wa-gateway-url");
    if (saved) gatewayPattern = saved;
  }

  let finalUrl = gatewayPattern.replace("{{phone}}", normalized);
  if (message) {
    if (gatewayPattern.includes("wa.me") || gatewayPattern.includes("api.whatsapp.com")) {
      finalUrl += `${finalUrl.includes("?") ? "&" : "?"}text=${encodeURIComponent(message)}`;
    } else {
      finalUrl = finalUrl.replace("{{message}}", encodeURIComponent(message));
    }
  } else {
    finalUrl = finalUrl.replace("{{message}}", "");
  }
  return finalUrl;
};

/** Formata uma string numérica para formato de moeda BRL (ex: "125050" -> "1.250,50") */
export const maskBRL = (value: string): string => {
  const cleanValue = value.replace(/\D/g, "");
  if (!cleanValue) return "";
  
  const cents = parseInt(cleanValue, 10);
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  
  return formatted;
};

/** Converte uma string formatada em BRL de volta para número float (ex: "1.250,50" -> 1250.5) */
export const parseBRLInput = (formatted: string): number => {
  if (!formatted) return 0;
  const clean = formatted.replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
};
