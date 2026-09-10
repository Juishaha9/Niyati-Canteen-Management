USE niyati_canteen;

CREATE TABLE IF NOT EXISTS permissions (code VARCHAR(40) PRIMARY KEY, name VARCHAR(100) NOT NULL, sort_order INT NOT NULL DEFAULT 0) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS user_permissions (user_id BIGINT UNSIGNED NOT NULL, permission_code VARCHAR(40) NOT NULL, granted_by BIGINT UNSIGNED NULL, granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,permission_code), CONSTRAINT fk_up_user FOREIGN KEY(user_id) REFERENCES users(id), CONSTRAINT fk_up_permission FOREIGN KEY(permission_code) REFERENCES permissions(code), CONSTRAINT fk_up_granter FOREIGN KEY(granted_by) REFERENCES users(id)) ENGINE=InnoDB;

INSERT INTO permissions(code,name,sort_order) VALUES
 ('dashboard','Dashboard',10),
 ('menu','Menu Management',20),
 ('categories','Category Management',30),
 ('users','User Management',40),
 ('reports','Reports',50),
 ('discounts','Discounts History',60),
 ('complementary','Complementary History',70),
 ('cancel_orders','Cancel Orders / Bills',80),
 ('cancelled','Cancelled Bills History',90),
 ('modified','Modified Bills History',100),
 ('audits','Audit History',110),
 ('settings','Settings',120)
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT IGNORE INTO settings(setting_key,setting_value) VALUES
 ('business_name',''),
 ('email',''),
 ('logo_path',''),
 ('order_number_format','ORD-{seq}'),
 ('order_number_auto','1'),
 ('allow_order_cancellation','1'),
 ('require_cancellation_reason','1'),
 ('auto_free_table_after_completion','1'),
 ('bill_number_format','BILL-{seq}'),
 ('bill_number_auto','1'),
 ('payment_methods','CASH,UPI'),
 ('show_logo_on_bill','1'),
 ('show_waiter_name','1'),
 ('show_table_number','1'),
 ('show_thank_you_message','1'),
 ('thank_you_message','Thank you for visiting Niyati Canteen!'),
 ('default_order_status','DRAFT'),
 ('default_table_status','AVAILABLE'),
 ('confirm_cancel_order','1'),
 ('confirm_cancel_bill','1'),
 ('confirm_disable_user','1');
