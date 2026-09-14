-- Проверка двух гарантий целостности, на которых держится вся защита от
-- «покупок просто так». Оба сценария имитируют гонку двух одновременных
-- запросов за последним свободным ресурсом.

\set ON_ERROR_STOP off

BEGIN;

-- Подготовка: событие, тип билета на 1 штуку, стол, пользователь
INSERT INTO events (id, title, subtitle, starts_at, genre, age_limit, lineup,
                    description, cover_from, cover_to, status, created_at, updated_at)
VALUES ('e1', 'TEST NIGHT', '', now() + interval '3 days', 'techno', 18, '{}',
        '', '#FF2E93', '#7A1350', 'published', now(), now());

INSERT INTO ticket_types (id, event_id, name, description, price_kopecks, quantity, sold)
VALUES ('tt1', 'e1', 'Last one', '', 150000, 1, 0);

INSERT INTO club_tables (id, label, zone, seats, deposit_kopecks, blocked, x, y, w, h)
VALUES ('tb1', 'TEST-V1', 'vip', 6, 2500000, false, 0.1, 0.1, 0.1, 0.1);

INSERT INTO users (id, phone, name, role, tier, points, member_no, created_at)
VALUES ('u1', '+79990000001', 'Тест', 'guest', 'silver', 0, 'AR-TEST', now());

INSERT INTO orders (id, number, user_id, event_id, status, total_kopecks,
                    points_earned, created_at)
VALUES ('o1', 'ORD-T001', 'u1', 'e1', 'pending', 0, 0, now()),
       ('o2', 'ORD-T002', 'u1', 'e1', 'pending', 0, 0, now());

\echo ''
\echo '=== 1. Два покупателя за последний билет ==='

\echo '-- первый:'
UPDATE ticket_types SET sold = sold + 1
 WHERE id = 'tt1' AND sold + 1 <= quantity
RETURNING id, sold, quantity;

\echo '-- второй (должен вернуть 0 строк):'
UPDATE ticket_types SET sold = sold + 1
 WHERE id = 'tt1' AND sold + 1 <= quantity
RETURNING id, sold, quantity;

\echo ''
\echo '=== 2. Двойная бронь одного стола ==='

\echo '-- первая бронь:'
INSERT INTO table_bookings (id, order_id, event_id, table_id, guests, status)
VALUES ('b1', 'o1', 'e1', 'tb1', '{}', 'pending')
RETURNING id, status;

\echo '-- вторая бронь того же стола (должна упасть):'
SAVEPOINT before_dup;
INSERT INTO table_bookings (id, order_id, event_id, table_id, guests, status)
VALUES ('b2', 'o2', 'e1', 'tb1', '{}', 'pending')
RETURNING id, status;
-- Откат к точке сохранения: без него транзакция остаётся сломанной
-- и следующий сценарий проверить нельзя
ROLLBACK TO SAVEPOINT before_dup;

\echo ''
\echo '=== 3. После отмены стол снова свободен ==='

UPDATE table_bookings SET status = 'cancelled' WHERE id = 'b1';

\echo '-- повторная бронь после отмены (должна пройти):'
INSERT INTO table_bookings (id, order_id, event_id, table_id, guests, status)
VALUES ('b3', 'o2', 'e1', 'tb1', '{}', 'pending')
RETURNING id, status;

ROLLBACK;
