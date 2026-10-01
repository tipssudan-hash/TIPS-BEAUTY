-- Fixes a real bug in 20261001000100_gps_pricing_schema.sql's audit trigger, found by finally
-- running the backend suite live: deleting any delivery_pricing_config row always failed with
-- "insert or update on table delivery_pricing_config_audit violates foreign key constraint
-- delivery_pricing_config_audit_config_id_fkey".
--
-- Cause: the single AFTER INSERT OR UPDATE OR DELETE trigger's delete branch inserts an audit
-- row with config_id = OLD.id, but by the time an AFTER DELETE trigger runs, OLD's row has
-- already been removed from delivery_pricing_config -- so the audit row's FK has no parent to
-- point at. INSERT/UPDATE don't have this problem (AFTER is fine there: the row already exists
-- by the time an AFTER trigger fires). The fix is simply trigger *timing*, not the trigger
-- function itself: delete needs to audit-log BEFORE the row disappears, not after.
DROP TRIGGER IF EXISTS delivery_pricing_config_audit ON public.delivery_pricing_config;

CREATE TRIGGER delivery_pricing_config_audit_write
  AFTER INSERT OR UPDATE ON public.delivery_pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.delivery_pricing_config_audit_trigger();

CREATE TRIGGER delivery_pricing_config_audit_delete
  BEFORE DELETE ON public.delivery_pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.delivery_pricing_config_audit_trigger();

-- DOWN (manual):
--   DROP TRIGGER delivery_pricing_config_audit_write ON public.delivery_pricing_config;
--   DROP TRIGGER delivery_pricing_config_audit_delete ON public.delivery_pricing_config;
--   CREATE TRIGGER delivery_pricing_config_audit AFTER INSERT OR UPDATE OR DELETE ON
--     public.delivery_pricing_config FOR EACH ROW EXECUTE FUNCTION
--     public.delivery_pricing_config_audit_trigger(); -- (the original, broken-on-delete version)
