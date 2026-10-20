import React from "react";
import { Text } from "@react-email/components";
import { SellRequestEmail } from "./sell-request-layout";
import type { TemplateEntry } from "./registry";

const Email = ({ companyName }: { companyName?: string }) => <SellRequestEmail title="Nuova richiesta Vendo" companyName={companyName}><Text>L'amministratore dell'azienda ha richiesto l'attivazione di Vendo. La richiesta è in attesa di una decisione nell'area piattaforma, sezione Richieste Vendo.</Text></SellRequestEmail>;
export const template = { component: Email, subject: "Nuova richiesta Vendo — Trevi Fruit", to: "amato3380@gmail.com", displayName: "Nuova richiesta Vendo", previewData: { companyName: "Azienda dimostrativa" } } satisfies TemplateEntry;