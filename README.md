# Cosmos / Larkspur demo shop

A Node.js 22+ ecommerce playground connected to one [published n8n workflow](https://cosmos-team-5ia.app.n8n.cloud/workflow/mPhy7IFRIz30yzKq). The shop owns customer, order, inventory, warehouse, shipment, payment and support state. n8n routes events and calls the shop API. Payments, tracking, delivery updates, notifications and replies are simulations.

## Current implementation

The hosted workflow was restored from checkpoint **b21f771e** and published in place with **102 nodes and 17 canvas groups**. It keeps all 82 checkpoint nodes, adds the live shop API inventory and logistics path, and adds website support thread reconstruction. All hosted Data Table references now resolve to existing tables. The order lookup is a separate published, no-webhook subworkflow that verifies customer email through the shop API. The main workflow ID and three production webhook paths are unchanged. See the [implementation plan](docs/plans/INTEGRATION-PLAN.md) and [source node mapping](docs/plans/SOURCE-NODE-MAP.md). The local app keeps JSON files; Vercel deployment will use managed PostgreSQL for durable, transactional state. SQLite is not part of the plan.

Use the [documentation index](docs/README.md) and [workflow file index](n8n/README.md) to distinguish current behavior, plans and historical snapshots.

## Run the shared demo

1. Start `ngrok http 3000` and copy its HTTPS forwarding origin.
2. From this folder, run `npm run team:start -- https://YOUR.ngrok-free.dev`. Stop any older shop process first; two processes must not write the same `data/shop.json`.
3. In the **existing** n8n workflow, set `shopBaseUrl` to that origin in **OH Configuration**, **OH Followup Configuration**, and **Workflow Config**. Publish the existing workflow in place. Its ID and webhook paths must stay intact.
4. Open the shop at your ngrok URL. Use [Manager](http://localhost:3000/admin) for the Dashboard, Customers CRM, Orders, Warehouse, Shipping, Inventory, Support inbox, Webhook events, and **Connect n8n**. The connection panel shows the editor and webhook URLs in one place.

The local shop starts with an admin account (`admin@example.com`; default password `Admin123!`, configurable with `ADMIN_PASSWORD`). Register a customer account from **Sign in → Create an account** when you begin a test; the shop no longer seeds a fake customer record.

**Current test baseline (30 September 2026):** saved customers, orders, support tickets, webhook events and notifications have been cleared. Only the Manager account remains. The eight-product sample catalog and its starting stock are kept so checkout, inventory and warehouse flows can be exercised. The historical LC-1008 and T-103 entries below describe a completed test; they are not present in the current shop database. `team:start` does not clear data on later runs.

`team:start` retains existing shop data, stores the current shop and n8n URLs, and generates `n8n/final/Cosmos-Ecommerce.import.json`. The shared demo API key remains in `team.config.json`; keep that file private. See [team setup](docs/TEAM-SETUP.md) for another n8n workspace.

## Integrated workflow

The hosted workflow contains order handling and followups, live stock checks and reservations, warehouse tasks, demo shipping and delivery, payment reconciliation, human review, and website support ticket triage. Its three production webhook paths are `/webhook/larkspur-order-handling`, `/webhook/order-ready-for-shipment`, and `/webhook/larkspur-support`. The shop's separate Logistics webhook setting stays empty because order handling calls the Logistics webhook directly; setting both would duplicate the handoff.

The Inventory flow is connected as `INV |` nodes: it reads the live order and stock, reserves **once** through the shop API, checks the saved warehouse task, and records shortages for staff. Logistics creates a demo shipment, polls saved delivery updates, and reconciles the demo payment. Website support loads saved customer and staff messages, reconstructs the transcript in `Support | Reconstruct Thread`, triages the full thread, and queues a suggested reply in Manager → **Message outbox** for staff review. Customers can continue a conversation from **My account**; Manager shows the same thread and staff replies. No reply is sent automatically. The original Gmail/AI support nodes remain in the workflow but are disabled and disconnected; this website support path uses deterministic keyword triage, not the original Gemini Agent/knowledge-base behavior, and does not send email.

The restored canvas keeps the checkpoint's original Gemini, Gmail, Drive, lookup, and Data Table nodes. All Gmail nodes are disabled and disconnected. `OH Sync` uses the five-column `order` table as a lookup mirror; the website remains authoritative for full order, stock, warehouse, shipment, payment, and support records. The preserved Gmail support nodes bind to the existing seven-column `conversation_context` table, which is empty and dormant. Website support messages are stored with their tickets and reconstructed through the shop API.

## Verified demo

On 30 September 2026, fresh demo order **LC-1008** (€44, authorized demo payment) passed through customer checkout and confirmation, one stock reservation, warehouse task, simulated shipment and delivery, and payment settlement. n8n executions **97–105** succeeded; the Manager and customer account both showed the delivered order. Support ticket **T-103** linked to that order received two customer follow-ups; n8n executions **106–108** succeeded, and execution **108** reconstructed all three messages before high-priority delivery triage. Manager showed the same thread, and a staff reply appeared in the customer's account. `npm test` passed all **21** tests. No real email, carrier, payment processor, or physical delivery was involved. The timed 24-hour reminder and 72-hour review thresholds have not been exercised live.

Follow the exact [team test steps](docs/TEAM-SETUP.md#team-test-steps) when running a new demo. A webhook HTTP 200 alone does not prove the downstream execution completed; check n8n Executions and Manager.

## Files

| File | Purpose |
| --- | --- |
| `n8n/final/Cosmos-Ecommerce.integrated.json` | Export of the current published 102-node workflow, including 17 canvas groups and resource bindings |
| `n8n/final/Cosmos-Ecommerce.pre-source-integration.json` | 51-node export from before the source module adaptation |
| `n8n/final/Cosmos-Ecommerce.legacy-canvas.json` | 91-node pre-cleanup backup with the 40 disabled legacy nodes |
| `n8n/final/Cosmos-Ecommerce.import.json` | Generated configurable 102-node draft for a separate n8n workspace |
| `n8n/final/Cosmos-Shop-Order-Lookup.integrated.json` | Published callable child workflow; no webhook path, uses authenticated shop API lookup |
| `n8n/final/Cosmos-Shop-Order-Lookup.import.json` | Generated inactive child-workflow import for another n8n workspace |
| `n8n/final/Cosmos-Ecommerce.tested.json` | Unchanged historical tested snapshot with mock Logistics |
| `n8n/final/Cosmos-Ecommerce-logistics-ready.json` | Preserved earlier shop-backed Logistics candidate |
| `reference_docs/` | Original specifications and workflow references, unchanged |

`npm run team:configure -- https://YOUR.ngrok-free.dev` updates the generated import without starting the shop. `npm start` starts the server without team setup. `npm test` runs API, account and merge checks. Local state is stored in ignored `data/shop.json`; writes replace the file atomically. This remains a local single-process store, not Vercel persistence.

## Code map

| Location | Responsibility |
| --- | --- |
| `server.js` | HTTP server, local JSON-backed domain actions and APIs |
| `storage.js` | JSON reads and crash-safe atomic local writes |
| `auth.js` | Accounts, password verification and sessions |
| `integration.js` | n8n data adapters and current workflow decisions |
| `public/` | Storefront, customer account and Manager UI |
| `scripts/` | Team configuration and workflow generation |
| `tests/` | API, account, source preservation and configuration checks |
| `docs/plans/` | Proposed implementation and node preservation mapping |

The existing private demo configuration is retained in `team.config.json`; do not publish its secret values. This documentation cleanup does not publish the working tree to GitHub.
