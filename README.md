# Canteen Billing & Order Management PWA

A deployable PHP/MySQL point-of-sale monolith for Niyati Canteen. React + TypeScript powers the interactive interface; PHP handles sessions, validation, authorization, business logic, and all database writes. There is no REST API or Node backend.

See [requirements.md](requirements.md) for the complete software requirements.

## Architecture

- `public/index.php` bootstraps the application and dispatches normal GET/POST requests.
- `app/Services/OrderService.php` executes transactional, server-authoritative totals, payment, and cancellation logic.
- `routes/web.php` handles authenticated actions and renders the appropriate page data into the React bootstrap payload.
- `resources/js` builds to `public/assets`; PHP serves the static production files.
- `database/schema.sql` creates the schema and `database/seeders/initial.sql` provides legitimate initial configuration/menu data.

## Local setup

1. Install PHP 8.1+, MySQL 8+, and Node 20+ (Node is used only to compile the frontend).
2. Copy `.env.example` to `.env` and set MySQL credentials plus `APP_URL`.
3. Create/import the database:

```powershell
mysql -u root -p < database/schema.sql
mysql -u root -p < database/seeders/initial.sql
```

4. The seed creates an administrator with email `admin123@gmail.com` and temporary password `Niyati@2026`. Sign in and create a replacement administrator/password before production. Generate an alternative hash with:

```powershell
php -r "echo password_hash('YourStrongPassword', PASSWORD_DEFAULT), PHP_EOL;"
```

Then update the `users.password_hash` value for that account in MySQL. Create further users (managers/waiters, each with their own email login) through the Admin UI.

5. Install and compile the frontend:

```powershell
npm install
npm run build
```

6. Run locally from the project root:

```powershell
php -S localhost:8080 -t public public/router.php
```

Open `http://localhost:8080`. The temporary seed credentials are `admin123@gmail.com` / `Niyati@2026`. Pages use clean URLs (e.g. `/dashboard`, `/orders`, `/bills`); `public/router.php` routes any non-static request to `index.php`, which reads the page name from the URL path.

## Development

Use `npm run dev` while editing React/CSS. PHP continues to use normal PHP server requests. Before deployment, run `npm run typecheck` and `npm run build`.

## Production shared-hosting deployment

1. Build assets locally with `npm run build`.
2. Point the hosting document root to `public/` when possible. If the host cannot do this, keep application files above public web root and expose only public assets/index through its supported layout.
3. Set `.env` outside version control with production DB settings and HTTPS `APP_URL`.
4. Import schema then seed data once.
5. Give PHP write access to `storage/logs`, `storage/sessions`, and `storage/uploads/menu`.
6. Enable HTTPS so the session cookie becomes secure and PWA installation is supported.

## PWA

The app includes `manifest.webmanifest`, local icons, and a service worker. It caches only the static shell. Financial pages and every transaction require a live server/database connection and are never treated as offline-confirmed.
