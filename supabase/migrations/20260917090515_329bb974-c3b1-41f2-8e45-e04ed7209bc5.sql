REVOKE EXECUTE ON FUNCTION public.normalize_vat(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.manage_customer_record(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_customer_invitation(uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resend_customer_invitation(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_customer_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invitation_preview(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_customer_invitation(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.link_customer_record_to_relation(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.customer_record_match_suggestions(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.manage_customer_record(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_invitation(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_customer_invitation(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_customer_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_customer_record_to_relation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_record_match_suggestions(uuid) TO authenticated;
