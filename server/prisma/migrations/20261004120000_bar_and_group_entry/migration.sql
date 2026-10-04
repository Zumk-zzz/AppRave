ALTER TABLE club_tables ADD COLUMN included_entries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE club_tables ADD CONSTRAINT table_entries CHECK (included_entries >= 0 AND included_entries <= seats);
ALTER TABLE order_lines
  ADD COLUMN entry_included INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN entry_redeemed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN entry_reserved INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN bar_requested_at TIMESTAMP(3),
  ADD COLUMN preparing_qty INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN ready_qty INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN prepared_by_id TEXT,
  ADD COLUMN prepared_by_name TEXT;
ALTER TABLE order_lines ADD CONSTRAINT entry_limits CHECK (
  entry_included >= 0 AND entry_redeemed >= 0 AND entry_reserved >= 0 AND
  ((kind = 'ticket' AND redeemed + cancelled_qty + entry_reserved <= qty) OR
   (kind = 'table' AND entry_redeemed + entry_reserved <= entry_included) OR
   (kind = 'bar' AND entry_reserved = 0))
);
ALTER TABLE order_lines ADD CONSTRAINT bar_preparation_limits CHECK (
  preparing_qty >= 0 AND ready_qty >= 0 AND
  preparing_qty + ready_qty + redeemed + cancelled_qty <= qty
);
ALTER TYPE "StaffActionKind" ADD VALUE 'bar_started';
ALTER TYPE "StaffActionKind" ADD VALUE 'bar_ready';
CREATE TABLE entry_invitations (
  id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line_id TEXT NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  name TEXT NOT NULL, claimed_by_id TEXT REFERENCES users(id),
  admitted_at TIMESTAMP(3), revoked_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX entry_invitations_order_id_idx ON entry_invitations(order_id);
CREATE TABLE visits (
  user_id TEXT NOT NULL REFERENCES users(id), event_id TEXT NOT NULL REFERENCES events(id),
  entered_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, event_id)
);
-- Сохраняем право заказать бар у гостей, чей вход подтвердили до обновления.
INSERT INTO visits (user_id, event_id)
SELECT DISTINCT o.user_id, o.event_id
FROM orders o JOIN order_lines l ON l.order_id = o.id
WHERE o.event_id IS NOT NULL AND o.status IN ('paid', 'used')
  AND l.kind = 'ticket' AND l.redeemed > 0
ON CONFLICT DO NOTHING;
