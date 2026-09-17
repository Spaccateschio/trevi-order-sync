import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import type { TemplateEntry } from "./registry";

interface Props {
  sellerName?: string;
  recipientName?: string;
  inviteLink?: string;
  inviteCode?: string;
  expiresAt?: string;
}

const Email = ({ sellerName, recipientName, inviteLink, inviteCode, expiresAt }: Props) => {
  const seller = sellerName || "Il tuo fornitore";
  return (
    <Html lang="it" dir="ltr">
      <Head />
      <Preview>{`${seller} ti invita a collegare la tua azienda`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>Trevi Fruit</Text>
          <Heading style={heading}>{seller} ti invita a collegarti</Heading>
          <Text style={text}>
            {recipientName ? `Ciao ${recipientName}, ` : "Ciao, "}
            {seller} ti invita a collegare la tua azienda su Trevi Fruit per gestire insieme
            ordini, preparazione e consegne.
          </Text>

          {inviteLink ? (
            <Section style={{ margin: "24px 0" }}>
              <Button style={button} href={inviteLink}>
                Apri l’invito
              </Button>
              <Text style={small}>{inviteLink}</Text>
            </Section>
          ) : null}

          {inviteCode ? (
            <Section style={codeBox}>
              <Text style={codeLabel}>Se hai già un accesso, usa questo codice</Text>
              <Text style={code}>{inviteCode}</Text>
            </Section>
          ) : null}

          {expiresAt ? <Text style={small}>{`L’invito è valido fino al ${expiresAt}.`}</Text> : null}

          <Hr style={hr} />
          <Text style={small}>
            Il collegamento nasce solo dopo la tua conferma esplicita: nessun dato viene condiviso
            prima.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    `${(data["sellerName"] as string) || "Un fornitore"} ti invita su Trevi Fruit`,
  displayName: "Invito di collegamento",
  previewData: {
    sellerName: "Trevi Fruit S.R.L.",
    recipientName: "3 EMME ROMA SRL",
    inviteLink: "https://trevi-order-sync.lovable.app/invito/esempio-token",
    inviteCode: "K7M2XQ4B",
    expiresAt: "30/09/2026",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const brand = {
  fontSize: "13px",
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  color: "#1f2a44",
  margin: "0 0 16px",
  fontWeight: 700,
};
const heading = { fontSize: "22px", color: "#1f2a44", margin: "0 0 12px" };
const text = { fontSize: "15px", lineHeight: "24px", color: "#333333" };
const small = { fontSize: "12px", lineHeight: "20px", color: "#6b7280" };
const button = {
  backgroundColor: "#d99b28",
  color: "#1f2a44",
  fontWeight: 700,
  fontSize: "15px",
  borderRadius: "8px",
  padding: "12px 20px",
  textDecoration: "none",
  display: "inline-block",
};
const codeBox = {
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "16px 0",
};
const codeLabel = { fontSize: "12px", color: "#6b7280", margin: "0 0 4px" };
const code = {
  fontSize: "20px",
  letterSpacing: "4px",
  fontWeight: 700,
  color: "#1f2a44",
  margin: 0,
};
const hr = { borderColor: "#e5e7eb", margin: "24px 0 12px" };
