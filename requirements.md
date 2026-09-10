# Canteen Billing & Order Management PWA - Software Requirements

## 1. Project overview
Niyati Canteen Billing is a fast, table-led point of sale for a medium bus-stand canteen. It is a PHP/MySQL monolith with a React/TypeScript interface compiled to static assets for ordinary shared PHP hosting.

## 2. Goals
The system must make table ordering, billing, payment, and daily reconciliation quick on phone, tablet, and desktop. Financial records are retained and server-authoritative.

## 3. User roles
`ADMIN` has access to dashboard, menu, categories, tables, users, bills, reports, audits, settings, cancellation and all records. `MANAGER` and `WAITER` accounts see the same navigation and modules as `ADMIN` after login, but by default only `ADMIN` has unconditional access — every other role's real access to gated modules is governed by per-user permissions the admin manages from Settings > Access. New manager/waiter accounts are granted every permission at creation (full access, same as admin); the admin then revokes specific modules per user rather than granting them one by one. PHP enforces this on every request regardless of what the navigation shows.

## 4. Authentication
Users sign in with their email address and password. Passwords use `password_hash()` and `password_verify()`. Sessions rotate at login, expire after a configured inactivity period, use HTTP-only cookies, and are destroyed at logout. Every POST includes a CSRF token.

## 5. Admin dashboard
The dashboard reads aggregate database queries for today, week, and month. It displays paid net sales, bill count, discounts, complementary value, cancelled count, payment methods, top items, and recent bills. It never uses mock figures.

## 6. Manager table workflow
The manager opens Tables, selects an available table to create an order or an occupied table to continue one, taps menu cards, changes quantities, applies complementary and discount, saves, and accepts Cash or UPI payment. Paid and cancelled orders free the table.

## 7. Menu management
Admins manage categories and menu items with active state, display order, description, price, and a local WebP upload. Price changes create history. Deactivation does not change old order snapshots. Variants support Paani and Cold Drinks.

## 8. Orders and 9. Billing
Orders are DRAFT, OPEN, PAID, or CANCELLED. Server-generated order and bill numbers are based on the stored primary key and date. Order lines capture item name, variant, quantity, and unit-price snapshots. Browser print is optimized for a compact receipt and A4.

## 10. Discounts and 11. Complementary
Discounts are percentage or fixed, capped at the current payable amount, stored as separate records with actor, timestamp, amount, and reason. Complementary marks individual order lines payable at zero while retaining their gross value and actor/reason record.

## 12. Cancellation and 13. Modification tracking
Bills are never deleted. Cancellation stores actor, timestamp, reason, and retains the bill. Item changes, quantity changes, discounts, complementary use, creation, modification, payment, and cancellation create audit entries. Modified bill reports identify orders with modifications.

## 14. Payments
Initial methods are Cash, UPI, and Other. Payment is a transaction that writes a payment record, marks the order PAID, assigns a server bill number, and releases the table.

## 15. Daily, weekly, monthly reports
Reports filter a custom date range and show gross sales, discount, complementary, cancelled amount, net sales, bill count, item sales, and payment totals. Only PAID orders contribute to actual sales.

## 16. Item sales
Item reporting aggregates paid-line quantity, gross amount, discount allocation field, complementary amount, and net amount. It can be extended with additional sort controls without changing financial history.

## 17. Tables and 18. Users
Tables have a server-stored name, active state, order, and status. Admins can add and update tables. Users have a role, display name, email, active state, and hashed password.

## 19. Audit logs
`order_audits` and `bill_audits` record actor, action, before/after JSON values, optional reason, and timestamp. Financial rows are not hard deleted.

## 20. PWA
The manifest and service worker provide an installable shell. PHP pages and POSTs are intentionally network-only; no offline success is ever implied for an order or payment.

## 21. Responsive requirements
Manager ordering is desktop two-column menu/cart and collapses to a mobile-first menu followed by an accessible cart. Table cards and primary touch targets are large.

## 22. Database requirements
MySQL InnoDB uses foreign keys, indexed operational fields, UTC-compatible DATETIME fields, and `DECIMAL(12,2)` for every monetary field. No money uses FLOAT.

## 23. Security requirements
PDO prepared statements, strict server validation, output escaping, session timeout, authorization, CSRF, safe upload MIME/size checks, and no trusted frontend role or totals are required.

## 24. Image requirements
Menu images are optional local WebP files, maximum 2 MB, served through PHP-hosted storage. Images lazy-load in the order UI. There is no external image API dependency.

## 25. Business rules
Paid and cancelled bills are retained. Historical prices are immutable snapshots. PHP recalculates totals in a transaction. Discounts cannot make totals negative. Complementary cannot exceed a line amount. Cancelled bills are excluded from net sales. Table orders require a table ID.

## 26. Initial menu
The seed includes the supplied Tea, Breakfast, Maharashtrian, South Indian, Meals, Drinks, Chinese, and Specials items at confirmed prices, Paani/Cool Drink variants, and Samosa with no price until the admin configures it. Rice Plate and Jhunka Bhakri include their supplied component descriptions.

## 27. Future scope
The schema reserves `order_type` for takeaway. Delivery, KDS, inventory, purchases, GST invoices, customers, WhatsApp sharing, printer integrations, and a reliable offline queue are intentionally outside this release.

## 28. Acceptance criteria
Admin can authenticate, view real dashboard numbers, manage business data, inspect orders/bills/cancellations/modifications/audits, and run reports. Manager can authenticate to Tables, build orders with fast menu taps, save authoritative totals, accept payment, and release tables. The PWA installs and all financial POSTs require online PHP/MySQL processing.
