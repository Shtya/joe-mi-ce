ALTER TABLE products ADD COLUMN IF NOT EXISTS saco_sku varchar;
ALTER TABLE products ADD COLUMN IF NOT EXISTS extra_sku varchar;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS code varchar;
