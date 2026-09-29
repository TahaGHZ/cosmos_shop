# Hosted n8n and Larkspur shop

This guide describes the demo shop connected to the merged workflow. Original reference exports in `reference_docs/workflows/` are retained. The live configuration uses the new OH nodes for ordering; original Logistics still runs its mock implementation.

## Addresses

| Purpose | Address |
| --- | --- |
| Shop | https://erik-unbarking-foolhardily.ngrok-free.dev |
| n8n editor | https://cosmos-team-5ia.app.n8n.cloud/workflow/mPhy7IFRIz30yzKq |
| Ordering endpoint | https://cosmos-team-5ia.app.n8n.cloud/webhook/larkspur-order-handling |
| Original Logistics endpoint | https://cosmos-team-5ia.app.n8n.cloud/webhook/order-ready-for-shipment |
| Order data table | https://cosmos-team-5ia.app.n8n.cloud/projects/vQTwZ8PDBwRHwsR9/datatables/2oakhQTHCbyc9DIp |

The ngrok URL reaches the shop. The n8n URL receives order events. They serve different purposes. Keep the shop process and ngrok running during tests.

## Shop settings

In Admin → Connect n8n:

| Setting | Value |
| --- | --- |
| Ordering webhook URL | Ordering endpoint above |
| Logistics webhook URL | Empty |
| Website support webhook URL | Empty for this ordering test |
| Public shop URL | Shop address above |

An empty Logistics setting lets the confirmed event return to OH. OH checks stock again and calls the original Logistics endpoint itself.

## n8n settings

`OH Configuration` contains the shop address and original Logistics endpoint. `OH Followup Configuration` uses the same shop address. Shop HTTP nodes send `ngrok-skip-browser-warning: true`.

Create one Header Auth credential with header name `x-api-key` and the key from Admin → Connect n8n. The key is intentionally excluded from this guide and exported workflow files. Enter/save new credentials yourself in the n8n credential dialog.

Select this credential on:

- OH Get Live Order
- OH Check Stock
- OH Set Awaiting Confirmation
- OH Record Accepted Handoff
- OH Request Human Review
- OH List Pending Orders
- OH Apply Followup

`OH Hand Off To Original Logistics` calls n8n, not the shop, and does not use this API credential.

The `order` data table, ID `2oakhQTHCbyc9DIp`, has five string columns: `order_id`, `customer_email`, `status`, `tracking_number`, `estimated_delivery`. Select it in both `OH Sync Lookup Table` and `OH Sync Confirmation State`. Shop IDs such as `LC-1002` are text.

## What each event does

| Event / trigger | Result |
| --- | --- |
| `order.created` | Live shop lookup, table update, customer/address/items/payment/total validation, stock check, awaiting confirmation |
| Customer confirms | Live lookup, confirmed table state, another stock check, original Logistics webhook call, accepted handoff receipt |
| Other supported lifecycle events | Refresh lookup table without repeating fulfillment |
| Hourly follow-up | Simulated reminder after 24 hours; human review after 72 hours without confirmation |

The handler ignores `order.reminder` to avoid a reminder event loop. A handoff receipt records successful HTTP acceptance, not completion of Logistics. It is not a concurrency lock.

## Test sequence

1. Restart the shop process if its running version predates reminder/handoff endpoints: Ctrl+C, then `npm start` in `A:\cosmos_shop`.
2. Keep ngrok forwarding to the running shop port.
3. Ensure API credential and table bindings are selected. Publish the n8n workflow; use production webhook URLs.
4. During demo testing, keep real Gmail sending nodes disabled and the Gmail Trigger disabled unless intentionally testing mail support. The original exports contain fixed recipients.
5. Sign into the shop as `customer@example.com` with demo password `Customer123!`.
6. Add an in-stock product and place a new order with a full street/city/postal code/country address and successful simulated payment.
7. In n8n Executions, inspect the incoming `order.created` execution. In the shop, the order should become `awaiting_confirmation`. The `order` table should contain the same order ID, customer email, and status.
8. Open the order in My account and confirm it.
9. Inspect the `order.confirmed` execution and separate Logistics execution. The shop should record an accepted Logistics handoff after the webhook responds successfully.
10. Check executions for node errors even when the shop reports webhook delivery success. The webhook replies immediately, before downstream processing completes.

The new confirmation email node is disabled. Confirmation links and reminders also appear in the shop's simulated outbox. No real payment or courier transaction occurs.

## Preserved Logistics and support limitations

Original Logistics still constructs a hard-coded customer/product/payment record. It does not persist shipment/delivery updates to the shop. A completed mock Logistics execution does not make the live shop order delivered. Use the previously adapted `n8n/ready/Logistics-Shop.json` if you later choose live shop fulfillment, with the separate setup in `WORKFLOW-SETUP.md`.

The original Gmail support branch needs its Google/model credentials, conversation context table, and external Order Lookup workflow binding. Embedding Lookup nodes in the merged canvas does not change the agent's existing external workflow reference. Website support has no bridge into the original Gmail branch.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| ngrok offline | Restart the tunnel and verify the forwarding port matches the shop |
| Webhook 404 / not registered | Workflow publication and production URL; `/webhook-test/` only works while listening |
| HTTP Request 401 | Select the Header Auth credential; name must be `x-api-key`; value must match admin dashboard |
| HTML instead of JSON | Shop URL and ngrok warning header |
| Table missing / wrong schema | Select `order` in both OH table nodes; all five columns must be strings |
| Order stays received | Inspect n8n execution at lookup/table/validation; HTTP webhook acceptance alone is insufficient |
| No shipment appears in website | Expected with unchanged mock Logistics |
| Newly added API route missing | Restart the shop to load current server code |

If the ngrok address changes, update both OH configuration nodes and the Public shop URL. Do not change the hosted n8n webhook URLs unless their paths or instance change.

## Configuration and verification record

29 September 2026: the merged workflow was already present in the supplied n8n editor. The shop URL was already populated. The Logistics production URL was verified in the original Webhook node and added to OH Configuration. The `order` table and its five string columns were created. Shop Ordering URL and Public shop URL were saved.

Both OH upsert nodes were bound by ID to `2oakhQTHCbyc9DIp`. After reloading the editor, the bindings remained saved and column options resolved to `order_id (string)` / `Equals`. The Logistics endpoint in OH Configuration also remained saved after reload.

For the ordering demo, these live nodes were deactivated: Gmail Trigger, Send a message1, Reply to a message, Escalate To Human, Notify Customer Shipped, Notify Customer Delivered, Notify Employee Inconsistency, Notify Customer Delayed. OH Send Confirmation Email was already deactivated. These live activation switches are deliberate test configuration; original reference exports and original processing logic remain unchanged.

The user saved the `Header Auth account` credential. Its selection was verified on all seven OH shop HTTP nodes. Publication initially failed because three original support nodes lacked Google credentials. `Message a model`, `Download file`, and `Embeddings Google Gemini` were deactivated in the live workflow for this ordering demo. The workflow then published successfully as `Hosted ordering demo`. These additional activation switches leave the original source files and processing code unchanged; Gmail support is not enabled by this setup.

Live browser test on 29 September 2026 used the existing demo customer account, one Everyday Vase (€38), standard shipping (€6), full demo address, and Successful simulated payment. Order `LC-1002` progressed from received to awaiting confirmation to confirmed.

| Execution | Observed result |
| --- | --- |
| #1 | Order creation processing succeeded in 2.699s; shop became awaiting confirmation |
| #2 | Status event processing succeeded in 306ms |
| #3 | Customer confirmation processing succeeded in 2.431s; OH Record Accepted Handoff returned `ok: true`, order `LC-1002`, acceptedAt `2026-09-29T13:19:10.866Z` |
| #4 | Separate original mock Logistics execution succeeded in 20.401s |

The n8n `order` table was inspected after confirmation: exactly one row for `LC-1002`, `customer@example.com`, status `confirmed`, with empty tracking and estimated delivery fields. Empty shipping fields and the shop remaining confirmed are expected with the preserved mock Logistics implementation.

For another test, keep the shop and ngrok running, place a fresh successful demo order, wait a few seconds and refresh its status, then click “Yes, confirm my order”. Watch the workflow's Executions tab; no manual “Execute workflow” or test webhook listener is needed because the production workflow is published. Real mail, declined payment, reminder timing, and support processing were not tested in this live run.
