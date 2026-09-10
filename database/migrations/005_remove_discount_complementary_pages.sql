USE niyati_canteen;

DELETE FROM user_permissions WHERE permission_code IN ('discounts','complementary');
DELETE FROM permissions WHERE code IN ('discounts','complementary');
