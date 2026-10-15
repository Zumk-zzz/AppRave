ALTER TABLE orders ADD COLUMN receipt_email TEXT;
ALTER TABLE users ADD COLUMN telegram_id TEXT;
CREATE UNIQUE INDEX users_telegram_id_key ON users(telegram_id);
ALTER TABLE users DROP CONSTRAINT users_has_contact;
ALTER TABLE users ADD CONSTRAINT users_has_contact CHECK (phone IS NOT NULL OR email IS NOT NULL OR telegram_id IS NOT NULL);
