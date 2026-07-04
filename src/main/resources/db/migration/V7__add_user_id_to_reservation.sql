ALTER TABLE reservation
  ADD COLUMN user_id BIGINT REFERENCES "user"(id);
