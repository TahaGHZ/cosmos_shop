# Full workflow integration and Manager dashboard

Status: **implementation in progress**. Updated 30 September 2026.

The user approved implementing this plan piece by piece. The user also specified no SQLite and asked to keep JSON/local disk where deployment supports it. The local app will keep JSON; Vercel production needs a durable shared store.

## Scope and source preservation

- [Inventory source](../../n8n/sources/Inventory-Reserve-Stock-and-Create-Warehouse-Task.json): 9 nodes.
- [Customer Support source](../../reference_docs/workflows/E-commerce%20(1).json): 22 nodes.
- [Logistics source](../../reference_docs/workflows/Logistics-Delivery-Automation-3.json): 32 nodes.
- Existing Order Handling and its scheduled followups in the recorded integrated export.
- [Order Lookup Tool dependency](../../reference_docs/workflows/Order-Lookup-Tool%20(1).json), referenced by the support Agent.

All 63 source nodes are accounted for in [SOURCE-NODE-MAP.md](SOURCE-NODE-MAP.md). Preserve the source exports and prompts. Adapt storage, resource bindings and event transports in generated copies. Record every changed node type or expression. Do not satisfy preservation by leaving core modules as disconnected disabled canvas copies.

The incorrectly selected Inventory Overlay file is an earlier integration export, not one of the three authoritative source modules. Keep `reference_docs/`, the historical tested snapshot and previous snapshots unchanged.

## Observed current state

The website loads `data/shop.json` into memory and rewrites the file on saves. It already persists users, products, orders, support tickets, events and demo notifications. Login sessions are in memory. Reservations, warehouse details and shipments are embedded inside orders. Manager already has overview, CRM, orders, warehouse, shipping, inventory, support, outbox and connection screens; these need deeper records and clearer operations rather than another unrelated UI.

Current gaps confirmed in code:

- No separate stock movement ledger or transactional multi-record database.
- Support triage remains a keyword function, not the original Gemini classification/Agent workflow. The website now persists a stable thread ID and ordered messages on each ticket; n8n has a `Support | Reconstruct Thread` step before triage. Semantic summaries and the source information-completeness lifecycle are still absent.
- Webhook attempts are persisted, but pending delivery is launched with `setImmediate`; no startup recovery worker is present.
- An HTTP 2xx marks transport delivery successful; it does not record workflow completion.
- Website warehouse and delivery statuses collapse several distinctions in the Logistics source.
- Connection indicators currently infer “Connected” from a configured URL rather than a live health/result check.

The pre-integration hosted export had 59 nodes; the published restored workflow now has 102 nodes in 17 groups. Existing Gmail, Gemini and Drive nodes remain disabled or unused; credential presence does not establish successful authentication. The current `conversation_context` table (`5F3pUUYCSQ4Uw1Z6`) contains no recovered history and is only bound to the dormant legacy Gmail/AI context nodes. Do not create another duplicate table.

DB reconciliation readback: all six Data Table nodes now bind to existing schemas. The active `order` mirror is a five-field projection and matches the website's saved LC-1008 status, tracking number, and ETA. Legacy Gmail context nodes bind to the existing seven-field, empty `conversation_context` table and remain disconnected. A published, no-webhook `Cosmos Shop Order Lookup` child calls the ownership-checked shop API; its parent tool maps order ID from AI input and email from the Gmail sender. The source Gmail/AI route remains inactive, so only direct API ownership checks—not an AI-tool execution—were tested.

### Latest end-to-end evidence (30 September 2026)

- Demo order `LC-1008`: hosted executions `97–105` succeeded from order validation through inventory reservation, warehouse task, simulated shipment and delivery, and payment reconciliation. Manager and the customer account showed the same saved delivered order.
- Support ticket `T-103`: hosted executions `106–108` succeeded. Execution `108` reconstructed all three persisted messages before high-priority delivery triage and draft queuing. The customer follow-up form, Manager thread, and customer-visible staff reply were browser-checked.
- `npm test`: 21 tests passed. This covers local API/account/merge/configuration behavior; it does not test Vercel persistence, timed 24/72-hour followups, the Gemini Agent, Gmail, or a fresh n8n workspace import.
- All email nodes remain disabled; the test used demo payment and simulated warehouse/delivery states only.

## Proposed workflow arrangement

Four business workflows and one callable tool:

1. **Order Handling**: order events, validation, customer confirmation, reminders, lookup synchronization and Logistics handoff.
2. **Inventory & Warehouse**: the source nine-node process, with website storage operations and a single reservation owner.
3. **Logistics & Delivery**: the full source process, its notifications and all exception branches.
4. **Customer Support**: website/Gmail intake, conversation context, Gemini classification, Agent, knowledge-base ingestion/retrieval and human-review routing.
5. **Order Lookup Tool**: callable from the Agent; queries website records with a trusted customer identity.

Keep the existing hosted workflow ID for Order Handling. During cutover, move each existing Logistics/support webhook path to exactly one destination workflow. Remove those path registrations from the published old graph before publishing their replacement owners, with a recorded rollback export. The website queue holds events during this bounded cutover. No second active owner may register a duplicate path.

Each canvas has a left-to-right main path, nearby exception branches and named groups. AI models/tools stay visibly attached to their Agent. Knowledge-base ingestion is an explicit triggered section with a refresh result, not an orphan chain.

## Integration contracts

Retain public paths where applicable:

| Destination | Path | Input |
| --- | --- | --- |
| Order Handling | `/webhook/larkspur-order-handling` | Order creation/confirmation event and stable event ID |
| Logistics | `/webhook/order-ready-for-shipment` | Confirmed order ID, event ID and correlation ID |
| Inventory | `/webhook/warehouse/new-order` | `order_id`, `items: [{sku, qty}]`, event/correlation IDs |
| Customer Support | `/webhook/larkspur-support` | Conversation/message ID, event ID; trusted customer context fetched from website |

Use a versioned envelope with `event_id`, `event_type`, `occurred_at`, `correlation_id`, and entity IDs. Existing contracts remain accepted while adapters are introduced. Authenticate requests in both directions. Keep keys on the server and in n8n credentials, not browser configuration or generated logs.

Inventory keeps its successful reservation response and HTTP 409 stock-issue response. Logistics must explicitly route 409 to stock review rather than crash before its exception branch. A timeout can mean the reservation committed but the response was lost; retrying the same idempotency key returns the same reservation/task.

Proposed website callback: `POST /api/automation/events/:eventId/result`, carrying processing state, stage, workflow/execution identity and a safe error summary. Track transport (`pending`, `accepted`, `failed`) separately from processing (`queued`, `running`, `waiting_for_staff`, `completed`, `needs_review`, `failed`). API callbacks must not recursively re-emit the same command.

## Inventory and Logistics overlap

Inventory is the sole writer for reservation. Its adapter validates positive integer quantities, combines duplicate SKUs, reads all stock, and reserves the entire order in one database transaction or reserves nothing. Add an aggregation step before task creation: the source currently supplies one item per product to `Create Warehouse Task`.

Logistics retains its named inventory steps, but uses the Inventory result instead of a second stock deduction. `Send Order To Inventory & Warehouse` calls Inventory. Its later stock/reservation/update/task stages validate and synchronize that returned result. Missing source stages in the current integration are restored and connected.

Preserve Logistics validation and all routes. Replace fabricated reads/writes with website adapters:

- Include shipping in total validation; map demo authorized payment to the source paid contract without claiming real capture.
- Persist duplicate detection and reservation/task/shipment uniqueness.
- Keep warehouse pending/picking/verification/packaging/ready and discrepancy/damaged/missing/timeout reasons.
- Keep delivery in-transit/delivered/delayed and lost/damaged/failed/returned/timeout/unknown branches.
- Keep wait loops initially, with explicit polling intervals and persisted deadlines. Staff actions write authoritative statuses; loops read them.
- Reconcile stored transaction amount/currency/status rather than unconditionally changing payment to settled.
- Route shipped/delivered/delayed notifications and payment/human-review alerts to website notifications and cases in demo mode.

## Customer Support restoration

Keep the original Gemini classifier and Agent prompts, including the distinction between policy questions, explicit refund requests, complaints and standard returns. Preserve the knowledge-base requirement and human decision boundaries.

Add one normalized intake shape for website messages and the preserved Gmail entry point. Replace direct `Gmail Trigger` field references with normalized fields. Support customer follow-up messages on an existing conversation, not only new tickets. Serialize processing within each conversation so parallel messages do not overwrite its summary.

Retain the source context lookup/create/update sequence and its seven fields: `thread_id`, `customer_email`, `last_message`, `conversation_summary`, `requires_human`, `status`, `information_complete`. Proposed persistent website adapters implement these operations; any retained n8n table becomes a clearly designated compatibility mirror, not another independent source of truth.

Specific repairs:

- Ensure empty context lookup emits a usable item so the new-conversation branch executes.
- Normalize sender email without requiring a display-name `<email>` format.
- Validate classifier JSON and categories before routing; malformed output becomes a visible failed/review case.
- Record the currently unconnected `Other` category as an explicit outcome.
- Add an explicit knowledge-base refresh trigger and track its source/version/last successful load. The source uses an in-memory vector store; do not claim durable embeddings. Verify reload behavior and handle an empty/unavailable index visibly.
- Rebind and verify Drive document access, Gemini model/embedding availability and credential authentication.
- Restore the callable Order Lookup workflow. Bind customer identity from authenticated conversation context, not a model-generated email argument.
- Keep reply and manager notification stages as website conversation/notification operations. Preserve Gmail node definitions and an explicit channel switch; real Gmail polling/sending remains disabled for demo tests.

## Persistence proposal

Keep `data/shop.json` as the local development format. Writes now use a same-directory temporary file, flush it, and atomically rename it over the current file to avoid leaving truncated JSON after a crash. This local file remains single-process and must not be shared by multiple app processes.

For Vercel, use a managed PostgreSQL service connected through the Vercel Marketplace, behind the same repository boundary. Vercel Functions may scale and run concurrent invocations; their instance-local memory/files are not a durable shared database. Vercel Blob can store private JSON and supports conditional writes, but the shop needs atomic multi-record updates for orders, reservations, stock and events. A transactional database is the safer production store. Do not add SQLite or silently fall back to instance-local files in production. Keep the JSON import/export path for local development and migration.

| Records | Required behavior |
| --- | --- |
| Customers/users, orders/items, payments | Preserve existing IDs, password hashes, totals, ownership and history |
| Products, reservations/lines, stock movements | Unique reservation per order, atomic stock changes, one-time release on cancellation |
| Warehouse tasks | One task per order, assignment, checklist, stage history and issue reason |
| Shipments and tracking events | One shipment creation per order, full delivery history and exception reason |
| Conversations/messages, drafts, review cases | Source summary fields, message history, assigned manager and decisions |
| Notifications, events, attempts and processing results | Durable queue, retry history, execution links and idempotency constraints |

Migration: stop the local single writer, back up JSON, import in one PostgreSQL transaction, compare IDs/counts/totals, then switch the deployment storage setting. A failed migration leaves the JSON source intact. Resume queued events after startup. Existing sessions may require a fresh login; persistent sessions are a separate implementation decision, not a prerequisite for durable orders.

## Manager dashboard

Extend the current UI around these tasks:

- **Overview:** actionable queues with counts and age, grouped by confirmation, warehouse, delivery, support and automation failure.
- **Order detail:** one timeline connecting customer, confirmation, reservation, stock, warehouse, shipment, payment, notifications and n8n executions.
- **Inventory:** on-hand/reserved/available, reorder threshold and adjustments with reasons/history.
- **Warehouse:** assignment, pick/verify/pack actions, ready gate and distinct issue categories.
- **Shipping:** tracking history, simulation controls and exception handling, clearly labeled as demo updates.
- **Support:** threaded customer messages, AI draft, cumulative summary, category, missing information, manager assignment/review and website reply.
- **Customers:** linked orders, conversations and open cases with search.
- **Automation:** transport versus processing state, last error, execution link, safe retry and attempt history.
- **Connections:** workflow cards with role, editor link, URL, actual health check and last successful processing time. Centralize website public-origin configuration so teammates do not edit scattered node scripts.

Use a shared website-origin configuration value in n8n if the instance supports it; otherwise generate all relevant configuration changes from one team setting. Do not trust an arbitrary event-provided callback URL for requests carrying credentials.

## Delivery sequence

- [x] Read corrected source files and current website implementation.
- [x] Preserve source inventory and write a complete proposed node mapping.
- [x] User approved staged implementation and source Data Table/mock-node adaptation to website APIs; SQLite is excluded.
- [x] Add crash-safe atomic writes to the local JSON store.
- [ ] Back up fresh hosted workflows and data; record resources and existing webhook ownership.
- [ ] Add the storage repository and managed PostgreSQL adapter for Vercel, then domain APIs and durable event delivery/results.
- [ ] Integrate Inventory and Logistics with one reservation/task/shipment owner.
- [x] Restore the callable shop-backed Order Lookup child and rebind all retained Data Table consumers to current tables; the original AI branch remains inactive and is not end-to-end verified.
- [ ] Restore original AI support and knowledge-base ingestion.
- [ ] Extend Manager and centralize connection configuration.
- [ ] Validate drafts, execute the acceptance scenarios, perform controlled hosted cutover and read back.
- [ ] Export final workflows and replace current setup steps with verified instructions.

## Acceptance criteria

1. Every one of the 63 source nodes has an implemented, connected destination or a documented channel-specific preserved role. Every type/expression change is traceable.
2. A confirmed multi-product order reserves once, creates one warehouse task, ships once, records simulated delivery and reconciles matching demo payment.
3. Duplicate events, a lost HTTP response and retry do not duplicate stock changes, tasks, shipments, replies or notifications.
4. Short stock on any line produces no partial reservation. Duplicate SKUs and invalid quantities are handled explicitly.
5. Local restart preserves records; Vercel PostgreSQL preserves records across instances and resumes pending delivery; migration conserves existing record IDs and totals.
6. Warehouse issues, delivery delay/exception/unknown status, timeout and payment mismatch appear in Manager and reach the original review branches.
7. Support handles a first message and follow-up using persistent context; policy retrieval, ownership-checked lookup, refund/complaint review, missing information and malformed model output are exercised.
8. Knowledge-base refresh succeeds visibly; unavailable/empty knowledge is handled without fabricated policy answers.
9. Dashboard status agrees with persisted data and n8n processing results. HTTP acceptance is never presented as completed fulfillment.
10. Customer isolation and admin controls hold. No key is exposed. Tests send no real email, charge no real payment and claim no physical delivery.

Update this checklist only with observed evidence and execution IDs. The current demo's earlier successful runs do not prove the proposed architecture.
