<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Le RPC manage_unit_of_measure e apply_product_sale_unit_batch sono solo server (EXECUTE solo service_role), chiamate da sales-units.functions.ts dopo il controllo is_company_admin: impedisce chiamate dirette dal client con company_id arbitrario.
- Consegne fornitore: le 4 RPC interne (open/set/add_extra/submit delivery) si chiamano con context.supabase (auth.uid()), senza bypass; il link esterno usa solo external_open_delivery/external_set_delivery_item/external_submit_delivery (EXECUTE solo service_role) dove il token decide l'ordine: impedisce accessi cross-azienda e cross-ordine.
- Flusso Acquisti (shopping-list.functions.ts, purchase.functions.ts): le RPC di utenti collegati si chiamano sempre con context.supabase, mai con il client privilegiato: le funzioni DB autorizzano con auth.uid() e senza sessione rispondono "Accesso non consentito".
