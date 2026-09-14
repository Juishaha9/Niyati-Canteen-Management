USE niyati_canteen;

-- A "counter" is a physical till/cash-register station — the unit a print
-- job actually targets. Most installs have exactly one; this table exists
-- so a second counter is a data row, not a code change. Seeded with one
-- row so the existing single-till setup keeps working unmodified.
CREATE TABLE IF NOT EXISTS counters (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO counters(name,sort_order) SELECT 'Counter 1',1 WHERE NOT EXISTS (SELECT 1 FROM counters);

-- One row per installed Niyati Print Bridge. Its identity is this random
-- token (hashed — the raw value is shown to the admin exactly once, at
-- generation time, the same pattern this app already uses for passwords),
-- never an IP address, which is unstable and spoofable. printers_json is
-- the printer list the bridge itself reports on each poll, so the app
-- never hardcodes a printer name.
CREATE TABLE IF NOT EXISTS print_bridges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  counter_id BIGINT UNSIGNED NOT NULL,
  bridge_code VARCHAR(20) NOT NULL UNIQUE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  printers_json TEXT NULL,
  last_seen_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NOT NULL,
  INDEX idx_bridge_counter(counter_id),
  CONSTRAINT fk_bridge_counter FOREIGN KEY(counter_id) REFERENCES counters(id),
  CONSTRAINT fk_bridge_creator FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- The print job queue. payload is the ESC/POS byte buffer (base64), already
-- built client-side by the existing, unchanged resources/js/receipt.ts from
-- server-confirmed order data (order.subtotal/grand_total/item.net_amount —
-- the same authoritative fields OrderService.php already computed and
-- stored) — this table never receives or stores a price/amount field of
-- its own, so there is nothing here for a client to lie about financially.
CREATE TABLE IF NOT EXISTS print_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  counter_id BIGINT UNSIGNED NOT NULL,
  -- NULL only for job_type='TEST' (Settings > Printer > Test Print, which
  -- never touches a real bill) — PrintJobService::create() is the one
  -- place that enforces order_id being required and PAID for job_type=
  -- 'RECEIPT'; a NULL FK value is simply not checked by MySQL, so this
  -- needs no separate constraint.
  order_id BIGINT UNSIGNED NULL,
  job_type VARCHAR(30) NOT NULL DEFAULT 'RECEIPT',
  paper_width ENUM('58','80') NOT NULL DEFAULT '80',
  payload MEDIUMTEXT NOT NULL,
  status ENUM('QUEUED','PROCESSING','PRINTED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  claimed_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at DATETIME NULL,
  printed_at DATETIME NULL,
  INDEX idx_print_jobs_counter_status(counter_id,status),
  INDEX idx_print_jobs_order(order_id),
  CONSTRAINT fk_pj_counter FOREIGN KEY(counter_id) REFERENCES counters(id),
  CONSTRAINT fk_pj_order FOREIGN KEY(order_id) REFERENCES orders(id),
  CONSTRAINT fk_pj_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_pj_bridge FOREIGN KEY(claimed_by) REFERENCES print_bridges(id)
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
