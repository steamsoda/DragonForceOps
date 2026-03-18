-- Products are now grouped by charge_type code in the app layer (PRODUCT_GROUPS constant).
-- The product_categories DB table is no longer needed.

ALTER TABLE public.products DROP COLUMN IF EXISTS category_id;

DROP TABLE IF EXISTS public.product_categories CASCADE;
