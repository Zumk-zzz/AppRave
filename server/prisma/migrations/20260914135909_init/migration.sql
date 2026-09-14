-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('guest', 'admin');

-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('silver', 'gold', 'black');

-- CreateEnum
CREATE TYPE "Genre" AS ENUM ('techno', 'house', 'hiphop', 'disco');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'published', 'cancelled');

-- CreateEnum
CREATE TYPE "TableZone" AS ENUM ('vip', 'lounge', 'bar');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'paid', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "BarCategory" AS ENUM ('cocktails', 'shots', 'champagne', 'strong', 'soft');

-- CreateEnum
CREATE TYPE "StockMoveKind" AS ENUM ('receipt', 'writeoff', 'sale', 'correction', 'refund');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'pending', 'paid', 'expired', 'cancelled', 'refunded', 'used');

-- CreateEnum
CREATE TYPE "LineKind" AS ENUM ('ticket', 'table', 'bar');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('created', 'succeeded', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'guest',
    "tier" "LoyaltyTier" NOT NULL DEFAULT 'silver',
    "points" INTEGER NOT NULL DEFAULT 0,
    "member_no" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "genre" "Genre" NOT NULL,
    "age_limit" INTEGER NOT NULL DEFAULT 18,
    "lineup" TEXT[],
    "description" TEXT NOT NULL DEFAULT '',
    "cover_from" TEXT NOT NULL,
    "cover_to" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price_kopecks" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_tables" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "zone" "TableZone" NOT NULL,
    "seats" INTEGER NOT NULL,
    "deposit_kopecks" INTEGER NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "club_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_bookings" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "guests" TEXT[],
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "table_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bar_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price_kopecks" INTEGER NOT NULL,
    "category" "BarCategory" NOT NULL,
    "volume" TEXT NOT NULL DEFAULT '',
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "bar_item_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'шт',
    "low_threshold" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("bar_item_id")
);

-- CreateTable
CREATE TABLE "stock_moves" (
    "id" TEXT NOT NULL,
    "bar_item_id" TEXT NOT NULL,
    "kind" "StockMoveKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "comment" TEXT,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "total_kopecks" INTEGER NOT NULL,
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "kind" "LineKind" NOT NULL,
    "ticket_type_id" TEXT,
    "bar_item_id" TEXT,
    "table_id" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "price_kopecks" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stub',
    "provider_id" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'created',
    "amount_kopecks" INTEGER NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "sms_codes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_member_no_key" ON "users"("member_no");

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE INDEX "ticket_types_event_id_idx" ON "ticket_types"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "club_tables_label_key" ON "club_tables"("label");

-- CreateIndex
CREATE INDEX "table_bookings_event_id_table_id_status_idx" ON "table_bookings"("event_id", "table_id", "status");

-- CreateIndex
CREATE INDEX "bar_items_category_idx" ON "bar_items"("category");

-- CreateIndex
CREATE INDEX "stock_moves_bar_item_id_created_at_idx" ON "stock_moves"("bar_item_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_expires_at_idx" ON "orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_id_key" ON "payments"("provider_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE INDEX "sms_codes_phone_created_at_idx" ON "sms_codes"("phone", "created_at");

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_bookings" ADD CONSTRAINT "table_bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_bookings" ADD CONSTRAINT "table_bookings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_bookings" ADD CONSTRAINT "table_bookings_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "club_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_bar_item_id_fkey" FOREIGN KEY ("bar_item_id") REFERENCES "bar_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_bar_item_id_fkey" FOREIGN KEY ("bar_item_id") REFERENCES "bar_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_bar_item_id_fkey" FOREIGN KEY ("bar_item_id") REFERENCES "bar_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
