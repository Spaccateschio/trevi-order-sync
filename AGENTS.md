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
