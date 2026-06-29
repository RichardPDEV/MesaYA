ALTER TABLE business
  ALTER COLUMN table_layout_json TYPE jsonb USING table_layout_json::jsonb;
