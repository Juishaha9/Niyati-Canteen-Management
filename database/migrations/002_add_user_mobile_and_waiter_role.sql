USE niyati_canteen;
ALTER TABLE users ADD COLUMN mobile VARCHAR(15) NULL AFTER display_name;
INSERT INTO roles(code,name) SELECT 'WAITER','Waiter' WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code='WAITER');
