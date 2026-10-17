export const SHARE_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" },
  { value: "sms", label: "SMS" }, { value: "telefono", label: "Telefono" },
  { value: "di_persona", label: "Di persona" }, { value: "altro", label: "Altro" },
  { value: "copia_testo", label: "Copia testo" },
] as const;
export type ShareChannel = typeof SHARE_CHANNELS[number]["value"];
export function shareRecipientError(channel: ShareChannel, recipient: string) {
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) return "Inserisci un indirizzo email valido";
  if ((channel === "whatsapp" || channel === "sms") && !/^\+?[0-9 ()-]{6,30}$/.test(recipient.trim())) return "Inserisci il numero completo di prefisso internazionale";
  return null;
}
export function shareHref(channel: ShareChannel, recipient: string, number: string | null, text: string) {
  const body = encodeURIComponent(text);
  if (channel === "email") return `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(`Ordine ${number ?? ""}`)}&body=${body}`;
  const phone = recipient.replace(/[^0-9+]/g, "");
  if (channel === "whatsapp") return `https://wa.me/${phone.replace(/^\+/, "").replace(/^00/, "")}?text=${body}`;
  if (channel === "sms") return `sms:${phone}?body=${body}`;
  return null;
}
export function priceUnitDiffers(price: string | null, purchase: string | null) {
  return Boolean(price?.trim() && purchase?.trim() && price.trim().toLowerCase() !== purchase.trim().toLowerCase());
}