import React from "react";
import { Text } from "@react-email/components";
import { SellRequestEmail } from "./sell-request-layout";
import type { TemplateEntry } from "./registry";

const Email = ({ companyName, reason }: { companyName?: string; reason?: string }) => <SellRequestEmail title="Richiesta rifiutata" companyName={companyName}><Text>La richiesta di attivazione di Vendo è stata rifiutata. Il profilo di vendita resta disattivato e i dati aziendali sono conservati.</Text><Text>Motivo: {reason || "Non indicato"}</Text></SellRequestEmail>;
export const template = { component: Email, subject: "Richiesta Vendo rifiutata — Trevi Fruit", displayName: "Richiesta rifiutata", previewData: { companyName: "Azienda dimostrativa", reason: "Prova" } } satisfies TemplateEntry;