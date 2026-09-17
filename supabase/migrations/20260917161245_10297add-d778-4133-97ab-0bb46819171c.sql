REVOKE ALL ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_invitation_row(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_customer_destination() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.accept_invitation_code(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_customer_invitation(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_free_invitation(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_companies(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accept_invitation_code(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_invitation(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_free_invitation(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_companies(text, text) TO authenticated;