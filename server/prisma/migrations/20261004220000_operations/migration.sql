ALTER TABLE table_bookings
 ADD COLUMN service_status TEXT NOT NULL DEFAULT 'reserved',
 ADD COLUMN responsible_id TEXT, ADD COLUMN responsible_name TEXT,
 ADD COLUMN arrived_at TIMESTAMP(3), ADD COLUMN occupied_at TIMESTAMP(3), ADD COLUMN released_at TIMESTAMP(3),
 ADD COLUMN deposit_initial_kopecks INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN deposit_remaining_kopecks INTEGER NOT NULL DEFAULT 0;
UPDATE table_bookings b SET deposit_initial_kopecks=l.price_kopecks, deposit_remaining_kopecks=l.price_kopecks
FROM order_lines l JOIN orders o ON o.id=l.order_id
WHERE b.order_id=o.id AND l.kind='table' AND b.status IN ('pending','paid') AND o.status IN ('pending','paid','used');
UPDATE table_bookings b SET service_status='arrived', arrived_at=o.used_at
FROM orders o WHERE b.order_id=o.id AND b.status='paid'
AND EXISTS (SELECT 1 FROM order_lines l WHERE l.order_id=o.id AND l.kind='table' AND l.entry_redeemed>0);
ALTER TABLE table_bookings ADD CONSTRAINT booking_service_status CHECK (service_status IN ('reserved','arrived','occupied','released'));
ALTER TABLE table_bookings ADD CONSTRAINT booking_deposit_limits CHECK (deposit_initial_kopecks>=0 AND deposit_remaining_kopecks>=0 AND deposit_remaining_kopecks<=deposit_initial_kopecks);
ALTER TABLE orders ADD COLUMN deposit_booking_id TEXT REFERENCES table_bookings(id), ADD COLUMN deposit_used_kopecks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD CONSTRAINT deposit_order_limits CHECK (deposit_used_kopecks>=0);
ALTER TABLE order_lines ADD COLUMN preparing_started_at TIMESTAMP(3), ADD COLUMN bar_ready_at TIMESTAMP(3);
ALTER TABLE shifts ADD COLUMN report JSONB;
ALTER TYPE "StaffActionKind" ADD VALUE 'bar_transferred';
ALTER TYPE "StaffActionKind" ADD VALUE 'table_updated';
ALTER TYPE "StaffActionKind" ADD VALUE 'deposit_spent';
CREATE TABLE order_activities (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
 kind TEXT NOT NULL, title TEXT NOT NULL, actor_name TEXT, details JSONB, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX order_activities_order_id_created_at_idx ON order_activities(order_id,created_at);
