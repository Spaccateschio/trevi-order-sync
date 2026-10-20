import React from "react";
import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

export function SellRequestEmail({ title, companyName, children }: { title: string; companyName?: string; children: React.ReactNode }) {
  return <Html lang="it" dir="ltr"><Head /><Preview>{title} — {companyName || "La tua azienda"}</Preview><Body style={{ backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" }}><Container style={{ padding: "24px 28px", maxWidth: "560px" }}><Text style={{ color: "#1f2a44", fontWeight: 700 }}>Trevi Fruit</Text><Heading style={{ color: "#1f2a44", fontSize: "22px" }}>{title}</Heading><Text>{companyName || "La tua azienda"}</Text>{children}</Container></Body></Html>;
}