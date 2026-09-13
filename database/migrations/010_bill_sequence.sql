-- Dedicated, transaction-safe counter for the human-readable bill number.
--
-- Previously, bill_number was derived directly from the order's own
-- auto-increment id (id+1000) at payment time. That's unique, but not
-- gap-free/continuous: an order that stays DRAFT/OPEN (never paid) or is
-- cancelled before payment leaves a hole in the sequence, and an order
-- that's paid *later* than a higher-id order that was paid earlier ends up
-- with a bill number that's out of order relative to when bills were
-- actually issued. A single-row counter, incremented only at the moment a
-- payment actually commits (see OrderService::pay), guarantees a tight,
-- monotonically increasing sequence that matches real-world bill issuance
-- order, is never reset by date, and is never consumed by a failed/rolled
-- back payment.
CREATE TABLE bill_sequence (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  next_number INT UNSIGNED NOT NULL
) ENGINE=InnoDB;

-- Seed from the highest bill number already issued (so existing history is
-- untouched and numbering simply continues from there); falls back to 100
-- (i.e. the first issued bill is 101) on a fresh install with no bills yet.
INSERT INTO bill_sequence (id, next_number)
SELECT 1, COALESCE(MAX(CAST(REGEXP_REPLACE(bill_number, '[^0-9]', '') AS UNSIGNED)), 100) + 1
FROM orders WHERE bill_number IS NOT NULL;
