USE niyati_canteen;

ALTER TABLE orders
  ADD COLUMN discount_approval_status ENUM('NONE','PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'NONE' AFTER complementary_amount,
  ADD COLUMN discount_approved_by BIGINT UNSIGNED NULL AFTER discount_approval_status,
  ADD COLUMN discount_approved_at DATETIME NULL AFTER discount_approved_by,
  ADD CONSTRAINT fk_order_discount_approver FOREIGN KEY(discount_approved_by) REFERENCES users(id);

CREATE TABLE IF NOT EXISTS item_discounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_id BIGINT UNSIGNED NOT NULL,
  discount_type ENUM('PERCENT','FIXED') NOT NULL,
  discount_value DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(500) NULL,
  applied_by BIGINT UNSIGNED NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_item_discount_item FOREIGN KEY(order_item_id) REFERENCES order_items(id),
  CONSTRAINT fk_item_discount_user FOREIGN KEY(applied_by) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT IGNORE INTO settings(setting_key,setting_value) VALUES
 ('discount_enabled','1'),
 ('discount_allowed_types','PERCENT,FIXED'),
 ('discount_scope','BOTH'),
 ('discount_max_percent','20'),
 ('discount_max_fixed','500'),
 ('discount_approval_threshold_percent','10'),
 ('discount_approval_threshold_fixed',''),
 ('complementary_enabled','1'),
 ('complementary_roles','ADMIN,MANAGER'),
 ('complementary_require_reason','1');
