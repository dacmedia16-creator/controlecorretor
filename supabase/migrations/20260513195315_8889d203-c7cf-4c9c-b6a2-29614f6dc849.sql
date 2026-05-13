REVOKE EXECUTE ON FUNCTION public.get_broker_lead_counts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_batch_unassigned_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_batch_unassigned_ids(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_lead_admin_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_broker_lead_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_batch_unassigned_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_batch_unassigned_ids(uuid, integer) TO authenticated;