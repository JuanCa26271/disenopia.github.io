# MAGA REST API

Express + TypeScript API for the public storefront and separately deployed admin application. PostgreSQL is only accessed by this service through Prisma. Configure `.env` from `.env.example`, install packages from `apps/api`, run `npm run db:generate`, `npm run db:push` for a new local database (or create reviewed migrations with `npm run db:migrate:dev`), `npm run db:seed`, then `npm run dev`.

The seed intentionally requires `ADMIN_INITIAL_PASSWORD`; set the requested initial password in the protected environment for the one-time seed, then rotate it at `/api/v1/admin/change-password` before using the console. Do not commit `.env`. Generate distinct random 32-byte base64 keys for customer data and uploaded assets, plus a JWT secret. Back up keys separately from the database. Loss of either encryption key makes corresponding stored data unreadable.

Public origins are restricted to `STORE_ORIGIN` and `ADMIN_ORIGIN`. In production use HTTPS/TLS at the reverse proxy, set `NODE_ENV=production`, Secure cookies, an identity-aware access policy for the admin hostname, backups, monitoring and key rotation. This is application code, not a claim that a deployment is unhackable or certified.

`schema.prisma` and `schema.sql` are equivalent PostgreSQL representations. `schema.sql` is supplied for review; prefer Prisma migrations as the deployment source of truth.

## Routes

- Public: `GET /api/v1/store/catalog`; `POST /api/v1/store/calculate-quote-and-date`; `POST /api/v1/store/checkout`; `GET /api/v1/store/ticket/:ticket_code` and `/pdf`.
- Admin: `POST /api/v1/admin/login`; then cookie-authenticated dashboard, product/extra CRUD, status changes, workshop settings, catalog image uploads at `POST /api/v1/admin/assets/:purpose` (`PRODUCT_REFERENCE`, `COLLECTION_REFERENCE`, or `SYSTEM_CUSTOMIZATION`), and `POST /api/v1/admin/print/generate-tabloid`.
- Login body is `{ "username": "MAGA@ADMON", "password": "..." }`. Login sets a short-lived HttpOnly cookie. After first seeded login, change the initial password through `POST /api/v1/admin/change-password` before other admin operations.

Product `referenceImages` are normalized to `product_reference_images`; workshop holidays are rows in `workshop_holidays`. Customer PII is encrypted field-by-field using separate random GCM nonces; the `encryption_iv` and `encryption_auth_tag` columns store JSON maps of the three per-field values.

Uploads are decoded and re-encoded, checked by magic bytes, encrypted with AES-256-GCM, and written to separate private folders under `UPLOAD_DIR`: `catalog/products/`, `catalog/collections/`, `catalog/customizations/`, and `orders/customer-personalizations/`. The `uploaded_assets.purpose` column classifies each file as well, while order/customer details stay in the separate `orders`, `order_items`, and `order_item_customizations` tables. Public storefront uploads are always classified as order customizations; catalog uploads require the authenticated admin route. Mount a durable private volume at `UPLOAD_DIR` in production, or replace the file store with private object storage. Older files without a purpose remain marked `LEGACY` and keep their existing storage keys. The print endpoint loads local encrypted uploads directly and only fetches external assets from exact HTTPS hostnames in `ASSET_HOST_ALLOWLIST`; it rejects redirects, caps bytes and pixel count, requires enough pixels for 300 DPI, fits pieces over one or more tabloid pages with crop marks, and returns 422 if a design itself exceeds the safe printable area. MaxRects is a heuristic; it cannot promise mathematically perfect paper utilization.

For requests from a browser, send JSON to quote/checkout and use `credentials: 'include'` for admin calls. The admin API requires the `Origin` header to equal `ADMIN_ORIGIN`; the store origin cannot call private routes. A successful initial login returns `passwordChangeRequired: true`; only session, logout and password-change routes work until the password is rotated.
