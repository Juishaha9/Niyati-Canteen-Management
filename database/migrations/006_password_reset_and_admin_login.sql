USE niyati_canteen;

CREATE TABLE password_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prt_user (user_id),
  INDEX idx_prt_token_hash (token_hash),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Switch the seeded admin account to the requested email-style login.
-- Hash below is password_hash('Niyati@2026', PASSWORD_DEFAULT).
UPDATE users SET username='admin123@gmail.com', password_hash='$2y$10$js1yYwI4w/XhAiPbJ/panePafNiGqxdpCqCdcR3LeOwbQN5sPKg1e' WHERE username='admin';
