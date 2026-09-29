# Archived: previous shop guide

Historical setup route. Use [the current README](../../README.md) and [team setup](../TEAM-SETUP.md) for the tested workflow. Paths in prose below are relative to the repository root.

Fake home-goods storefront with customer/admin accounts, persistent orders, inventory, warehouse tasks, simulated courier/payment records, support tickets, and outgoing n8n webhooks. Node 22+, no package installation or build needed.

```powershell
npm start
```

Shop: http://localhost:3000 · Sign in: http://localhost:3000/login · Admin: http://localhost:3000/admin · Customer account: http://localhost:3000/account

| Account | Email | Password |
| --- | --- | --- |
| Admin | admin@example.com | Admin123! |
| Customer | customer@example.com | Customer123! |

Customer registration is also available. Customers access only their own orders/tickets. Admin manages all operations. Salted password hashes, HttpOnly cookie sessions, 12-hour expiry; sessions expire on server restart. These known demo credentials are intended for fake data.

**Restart an already running server with Ctrl+C, then npm start to load changes.** Saved data remains in data/shop.json; accounts and new connection settings are added automatically.

Read [the archived workflow guide](WORKFLOW-SETUP.md) for the earlier configuration, API contracts, and adapted exports.

Prepared import files in n8n/ready/:

- Ordering-Shop.json — validates checkout; hands confirmed orders to Logistics.
- Order-Lookup-Shop.json — email-verified order lookup against live shop data.
- Logistics-Shop.json — replaces hard-coded orders/stock/shipment/payment with shop APIs.
- E-commerce-Gmail-Shop.json — original Gmail channel using the shop lookup subworkflow.
- E-commerce-Website-Shop.json — support agent adapted to website tickets, with replies in My account.

Original references remain untouched in reference_docs/. The KB is policy reference content, not instructions to the developer or proof of actual customer records. All products, payments, shipping, stock, and prices are demo fixtures. The site does not send email. Adapted Gmail action nodes are disabled until you configure and enable them yourself.

Admin → Connect n8n contains the separate Ordering, Logistics, Website support, and Public shop URL settings. Copy the generated automation key to an n8n Header Auth credential named x-api-key, and select that credential for every HTTP Request node. Browser users authenticate with their own cookies, not the automation key.

For remote n8n, run ngrok http 3000 separately and use its forwarding address in the shop settings and workflow config nodes. No tunnel is created automatically. Local Windows Docker n8n generally uses http://host.docker.internal:3000; direct local n8n uses http://localhost:3000.

## API overview

For the earlier additive preservation merge, use `n8n/merged/E-commerce-All-In-One.json` and [its archived guide](MERGE-README.md). It includes the new order handler alongside the original nodes. The original Logistics mock behavior and external Lookup workflow reference remain intact. Regenerate these historical exports with `npm run merge:workflows`; use final/ for the tested hosted snapshot.

- Public reads: GET /api/products, /api/policies (original Markdown), /api/health.
- Accounts: POST /api/auth/login, /api/auth/register, /api/auth/logout; GET /api/auth/me.
- Customer: GET/POST /api/orders, GET /api/orders/:id, POST /api/orders/:id/confirm or /cancel, GET/POST /api/support. Customer identity is bound to login; other customers' records are unavailable.
- Admin/automation: order actions validate/reserve/warehouse/ship/delivery/reconcile, inventory GET/PATCH, support PATCH and POST /api/support/:id/replies, settings GET/PATCH, events GET/replay, simulated notification outbox.
- Automation header only: POST /api/automation/order-lookup with order_id and customer_email; GET /api/automation/orders/:id and /stock, /warehouse, /shipment; POST actions with workflow-compatible responses, /reconcile, /escalate.

Orders use structured shippingAddress fields: street, city, postal_code, country. Logistics adapters add products with sku/name/qty/price, total_amount, shipping_amount, paid_amount, payment_status, tracking_number, estimated_delivery, and workflow statuses. Detailed routes and mappings are in the workflow setup guide.

Totals use server prices in EUR: standard shipping €6, free at €100; express €12. Demo payment modes: authorized/failed/pending. Orders accept Idempotency-Key header or idempotencyKey body. Reservation, cancellation, shipment creation, validation, and payment reconciliation are guarded against duplicate writes. Events contain snapshots; lookup the order for the latest state. Webhook HTTP acceptance does not prove downstream n8n success. Replay is manual; there is no automatic retry worker.

## Environment and checks

Supported settings: PORT, HOST, DATA_DIR, API_KEY (overrides generated automation key), N8N_WEBHOOK_URL, PUBLIC_BASE_URL, WEBHOOK_SECRET (outgoing header), ADMIN_PASSWORD, CUSTOMER_PASSWORD. Password overrides apply only when the accounts are first created. Saved URLs take precedence over environment defaults. No automatic .env loading.

```powershell
npm test
npm run prepare:workflows
```

Tests use temporary stores and ports 3107–3109, covering lifecycle rules, stock/cancellation, payments, webhook replay, account permissions, customer isolation, support replies, and the supplied Logistics contract. Live n8n credential binding, import, model execution, and mail delivery still require verification in your instance. The single-process JSON store is intended for a workshop.
