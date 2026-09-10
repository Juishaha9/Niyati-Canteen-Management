USE niyati_canteen;

-- Forgot password no longer uses email/token links; it resets directly from
-- email + new password + confirm password, so the token table is unused.
DROP TABLE IF EXISTS password_reset_tokens;
