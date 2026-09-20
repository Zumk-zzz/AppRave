-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "cancelled_qty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "redeemed" INTEGER NOT NULL DEFAULT 0;
