-- Выдать и отменить нельзя больше, чем куплено.
--
-- Условные UPDATE в коде уже это стерегут, но код правят чаще, чем схему,
-- и одна забытая проверка означает лишний коктейль за стойкой или билет,
-- вернувшийся в продажу дважды. Здесь это просто невозможно.
ALTER TABLE "order_lines"
  ADD CONSTRAINT "order_lines_within_qty"
  CHECK (
    "redeemed" >= 0
    AND "cancelled_qty" >= 0
    AND "redeemed" + "cancelled_qty" <= "qty"
  );
