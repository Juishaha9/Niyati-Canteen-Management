CREATE TABLE order_sequence (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  next_number INT UNSIGNED NOT NULL
) ENGINE=InnoDB;

INSERT INTO order_sequence (id, next_number) VALUES (1, 101);
