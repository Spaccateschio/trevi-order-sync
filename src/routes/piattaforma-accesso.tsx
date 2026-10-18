import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/piattaforma-accesso")({
  head: () => ({
    meta: [
      { title: "Accesso amministrazione — Trevi Fruit (mockup)" },
      {
        name: "description",
        content: "Accesso riservato all'area di amministrazione della piattaforma.",
      },
      { property: "og:title", content: "Accesso amministrazione — Trevi Fruit (mockup)" },
      {
        property: "og:description",
        content: "Accesso riservato all'area di amministrazione della piattaforma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformLogin,
});

function PlatformLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ShieldCheck className="h-10 w-10 text-primary" aria-hidden />
          <CardTitle className="font-display text-xl">Amministrazione piattaforma</CardTitle>
          <p className="text-sm text-muted-foreground">
            Accesso riservato al team interno di Trevi Fruit
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@piattaforma.it"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button className="w-full" asChild>
            <Link to="/piattaforma">Entra (mockup)</Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Pagina dimostrativa: l'accesso non è ancora controllato.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
