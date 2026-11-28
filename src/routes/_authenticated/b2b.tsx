import { createFileRoute, redirect } from "@tanstack/react-router";

// La pagina intermedia B2B aveva una sola voce: si va diretti ai Collegamenti (schede Clienti/Fornitori).
export const Route = createFileRoute("/_authenticated/b2b")({
  beforeLoad: () => {
    throw redirect({ to: "/collegamenti", replace: true });
  },
});
