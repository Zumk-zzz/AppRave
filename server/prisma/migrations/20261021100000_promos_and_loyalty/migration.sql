ALTER TABLE orders ADD COLUMN subtotal_kopecks INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN discount_kopecks INTEGER NOT NULL DEFAULT 0, ADD COLUMN promo_code TEXT;
UPDATE orders SET subtotal_kopecks=total_kopecks;
ALTER TABLE order_lines ADD COLUMN discount_kopecks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_lines ADD CONSTRAINT line_discount_valid CHECK (discount_kopecks>=0 AND discount_kopecks <= price_kopecks::BIGINT*qty);
CREATE TABLE promos (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, kind TEXT NOT NULL,
 value INTEGER NOT NULL, scope TEXT NOT NULL DEFAULT 'tickets', active BOOLEAN NOT NULL DEFAULT FALSE,
 event_id TEXT, min_subtotal_kopecks INTEGER NOT NULL DEFAULT 0, max_uses INTEGER, per_user_limit INTEGER NOT NULL DEFAULT 1,
 starts_at TIMESTAMP(3), ends_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT promo_rules CHECK (kind IN ('percent','fixed') AND scope IN ('tickets','bar','tickets_bar') AND value>0 AND (kind<>'percent' OR value<=90) AND min_subtotal_kopecks>=0 AND (max_uses IS NULL OR max_uses>0) AND per_user_limit>0 AND (ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at))
);
CREATE TABLE promo_uses (
 id TEXT PRIMARY KEY, promo_id TEXT NOT NULL REFERENCES promos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','used','released')),
 amount_kopecks INTEGER NOT NULL CHECK (amount_kopecks>0), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX promo_uses_promo_id_user_id_state_idx ON promo_uses(promo_id,user_id,state);

ALTER TYPE "StaffActionKind" ADD VALUE 'promo_created';
ALTER TYPE "StaffActionKind" ADD VALUE 'promo_updated';
