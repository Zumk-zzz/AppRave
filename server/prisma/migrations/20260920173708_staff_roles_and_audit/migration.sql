-- CreateEnum
CREATE TYPE "StaffActionKind" AS ENUM ('entry_admitted', 'entry_manual', 'bar_issued', 'shift_opened', 'shift_closed', 'role_granted', 'role_revoked', 'stock_adjusted');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'bartender';
ALTER TYPE "UserRole" ADD VALUE 'doorman';
ALTER TYPE "UserRole" ADD VALUE 'manager';

-- CreateTable
CREATE TABLE "staff_actions" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "kind" "StaffActionKind" NOT NULL,
    "order_id" TEXT,
    "details" JSONB,
    "shift_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ban_entries" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lifted_at" TIMESTAMP(3),

    CONSTRAINT "ban_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_actions_actor_id_created_at_idx" ON "staff_actions"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "staff_actions_created_at_idx" ON "staff_actions"("created_at");

-- CreateIndex
CREATE INDEX "shifts_user_id_opened_at_idx" ON "shifts"("user_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "ban_entries_phone_key" ON "ban_entries"("phone");

-- CreateIndex
CREATE INDEX "ban_entries_phone_idx" ON "ban_entries"("phone");

-- AddForeignKey
ALTER TABLE "staff_actions" ADD CONSTRAINT "staff_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_actions" ADD CONSTRAINT "staff_actions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
