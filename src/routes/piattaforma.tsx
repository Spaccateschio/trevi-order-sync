import { createFileRoute } from "@tanstack/react-router";

import { PlatformShell } from "@/components/platform/platform-shell";

export const Route = createFileRoute("/piattaforma")({
  component: PlatformShell,
});
