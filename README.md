# St. Francis School, Vadakkencherry — Website

Node.js (Express + EJS) website with an admin panel, backed by the existing Render PostgreSQL 18 database.

## Database safety

The database is shared with **sfsapp**. Everything this website creates lives in its own **`website` schema**
(`website.settings`, `website.media`, `website.session`, …). The connection sets `search_path=website`, and nothing
in this project reads or writes the `public` schema used by sfsapp.

Uploaded photos and PDFs are stored in `website.media` (photos are converted to compressed WebP plus a thumbnail).
**Admin → Storage** shows how full the database is. Warnings appear at 70% and 90%, and uploads are blocked at 95%.

## Run locally

```bash
npm install
cp .env.example .env               # set DATABASE_URL (external URL) and SESSION_SECRET
npm run migrate                    # creates/updates the website schema (also runs on server start)
npm run create-admin -- admin 'a-strong-password'
npm run dev                        # http://localhost:3000, admin at /admin
```

`npm run create-admin -- <user> <password>` also resets the password of an existing admin.

## Deploy on Render

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint**, pick the repo (uses `render.yaml`), or create a Web Service with
   build `npm ci --omit=dev` and start `npm start`.
3. Set `DATABASE_URL` to the sfsapp database's **internal** connection string (same region, no SSL needed).
4. `SESSION_SECRET` is generated automatically. Set `DB_STORAGE_LIMIT_MB` to your DB plan's size.
5. After the first deploy, open the Render shell and run `npm run create-admin -- admin '<password>'`
   (or run it locally against the external URL).

## Screenshots (development)

```bash
node screenshot.mjs http://localhost:3000 home --full
node screenshot.mjs http://localhost:3000 home-mobile --mobile
ADMIN_PW=... node screenshot.mjs http://localhost:3000/admin/storage storage
```

Images are saved to `temporary screenshots/`.
