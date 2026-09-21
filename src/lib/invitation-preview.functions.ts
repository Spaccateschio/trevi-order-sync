import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * L'anteprima dell'invito è consultabile senza accesso, ma solo con il token:
 * la lettura passa dal server, così la procedura del database non è più
 * eseguibile direttamente da chi non ha effettuato l'accesso.
 */
export const getInvitationPreview = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string().trim().min(10).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("invitation_preview", { _token: data.token });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown[])[0] ?? null;
  });
