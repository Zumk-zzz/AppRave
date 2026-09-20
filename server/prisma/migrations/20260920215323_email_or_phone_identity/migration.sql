-- CreateEnum
CREATE TYPE "LoginChannel" AS ENUM ('phone', 'email');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- DropTable
DROP TABLE "sms_codes";

-- CreateTable
CREATE TABLE "login_codes" (
    "id" TEXT NOT NULL,
    "channel" "LoginChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_codes_destination_created_at_idx" ON "login_codes"("destination", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");


-- Аккаунт обязан иметь хотя бы один канал связи.
--
-- Prisma такое ограничение не выражает: она умеет «поле обязательно»,
-- но не «обязательно одно из двух». Без проверки можно завести
-- пользователя, до которого нельзя достучаться и под которым нельзя
-- войти — мусор, который потом придётся вычищать руками.
ALTER TABLE "users"
  ADD CONSTRAINT "users_has_contact"
  CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL);
