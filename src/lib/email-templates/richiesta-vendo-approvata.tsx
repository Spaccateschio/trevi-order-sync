import React from "react";
import { Text } from "@react-email/components";
import { SellRequestEmail } from "./sell-request-layout";
import type { TemplateEntry } from "./registry";

const Email = ({ companyName }: { companyName?: string }) => <SellRequestEmail title="Richiesta approvata" companyName={companyName}><Text>La richiesta di attivazione di Vendo è stata approvata. Il profilo di vendita è ora attivo su Trevi Fruit.</Text></SellRequestEmail>;
export const template = { component: Email, subject: "Richiesta Vendo approvata — Trevi Fruit", displayName: "Richiesta approvata", previewData: { companyName: "Azienda dimostrativa" } } satisfies TemplateEntry;