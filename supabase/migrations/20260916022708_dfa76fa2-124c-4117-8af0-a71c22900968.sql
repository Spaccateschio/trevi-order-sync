-- Nessun accesso pubblico/anonimo alle funzioni di sicurezza
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_company_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_company_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_company_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_customer_user(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_customer_owner(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_sees_customer(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_admin_of_customer(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_sees_company(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_company_with(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_customer_company(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

-- Le funzioni di controllo accessi devono restare valutabili dalle policy per gli utenti autenticati
GRANT EXECUTE ON FUNCTION public.is_company_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_customer_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_customer_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_sees_customer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_admin_of_customer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_sees_company(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_company_with(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_customer_company(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;