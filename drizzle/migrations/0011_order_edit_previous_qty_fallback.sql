CREATE OR REPLACE FUNCTION public.order_item_previous_qty_fallback()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.customer_order_edit', true) = 'on'
     AND NEW.previous_quantity IS NULL AND OLD.purchase_quantity IS NULL
     AND NEW.purchase_quantity IS DISTINCT FROM OLD.purchase_quantity THEN
    NEW.previous_quantity := OLD.ordered_quantity;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_order_item_previous_qty_fallback ON public.purchase_order_items;
CREATE TRIGGER trg_order_item_previous_qty_fallback BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_item_previous_qty_fallback();