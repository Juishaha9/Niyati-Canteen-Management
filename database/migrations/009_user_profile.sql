USE niyati_canteen;

-- Lets every user manage their own profile picture from Settings > My Profile.
ALTER TABLE users ADD COLUMN avatar_path VARCHAR(191) NULL AFTER mobile;
