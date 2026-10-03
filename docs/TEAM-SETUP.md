# Team setup

Read [README](../README.md) first. The shared n8n workspace runs one published workflow against one teammate's public shop URL at a time. Use the existing [workflow editor](https://cosmos-team-5ia.app.n8n.cloud/workflow/mPhy7IFRIz30yzKq); importing a second active copy would duplicate webhook paths.

The hosted workflow is restored from checkpoint **b21f771e** and published in place with 102 nodes and 17 groups. This guide covers the verified order, inventory, logistics, threaded website support, and data bindings. The [full integration plan](plans/INTEGRATION-PLAN.md) and [source node mapping](plans/SOURCE-NODE-MAP.md) track remaining website and Vercel work.

## Shared connections

| Resource | Binding |
| --- | --- |
| Workflow ID | `mPhy7IFRIz30yzKq` |
| Callable order lookup | `8cf0BBVr8yhEylqW` / `Cosmos Shop Order Lookup` |
| Order event webhook | `/webhook/larkspur-order-handling` |
| Logistics webhook | `/webhook/order-ready-for-shipment` |
| Website support webhook | `/webhook/larkspur-support` |
| Order Data Table | `2oakhQTHCbyc9DIp` / `order` |
| Legacy support-context table | `5F3pUUYCSQ4Uw1Z6` / `conversation_context` |
| Shop HTTP credential | `UgB67LNiMKERsMAQ` / `Header Auth account`, header `x-api-key` |

The credential's value is the shared demo `automationKey` in `team.config.json`; never paste it into screenshots or logs. Shop Admin → **Connect n8n** displays the workflow editor, order and support webhook, and public shop URL. Leave the shop's **Logistics webhook URL** empty: the order workflow calls the Logistics webhook itself. `npm run team:start -- https://YOUR.ngrok-free.dev` sets these shop connections and generates inactive imports for the main workflow and lookup child. Set the same public origin in the three n8n Code configuration nodes (**OH Configuration**, **OH Followup Configuration**, **Workflow Config**); the main workflow passes it into **Cosmos Shop Order Lookup**.

The website's JSON store is the source of truth. The n8n `order` table is a five-string-column lookup mirror (`order_id`, `customer_email`, `status`, `tracking_number`, `estimated_delivery`), not a second full order database. The `conversation_context` table has the seven source fields (`thread_id`, `customer_email`, `last_message`, `conversation_summary`, `requires_human`, `status`, `information_complete`); it is empty and used only by the disabled legacy Gmail/AI branch. Current website support uses the saved ticket thread through the shop API instead.

## Team test steps

1. Start `ngrok http 3000`, then `npm run team:start -- https://YOUR.ngrok-free.dev`. Open Manager → **Connect n8n** and check that the workflow editor, order webhook, support webhook and public shop origin point to the intended workspace and tunnel.
2. In the published workflow, check **OH Configuration**, **OH Followup Configuration**, and **Workflow Config** use that public shop origin. Check `INV | Load Order` → `INV | Check Stock` → `INV | Reserve Stock` → warehouse status is connected, followed by the shop-backed shipment and delivery stages. Legacy Gmail actions are present but disabled and disconnected. Website support uses its separate ticket triage and draft-outbox path. Confirm only this workflow owns the three production paths.
3. Register a customer account from **Sign in → Create an account**, add an in-stock product to the shop cart, and check out with a street, city, postal code and country. Choose **Successful** demo payment and place the order. Note its `LC-` ID.
4. In Manager → **Orders**, wait for **awaiting confirmation**. Open the order and select **Simulate customer confirmation**. In n8n **Executions**, inspect the `OH Receive Order Event` and `Order Ready For Shipment` executions. The logistics run should pass `INV | Load Order` → `Get Order` → `Validate Order` → `INV | Check Stock` → `INV | Reserve Stock` → warehouse task creation. Manager should show **packing** and a Warehouse task. Compare product stock before and after: one item ordered must reduce stock by one.
5. In Manager → **Warehouse**, open that task, mark **picked**, **verified**, **packed**, then **Mark ready**. In Manager → **Shipping**, wait for a demo shipment/tracking number and **in transit** status. The n8n run should include `Logistics | Create Demo Shipment` and `Logistics | Read Simulated Shipment`.
6. Open that shipment, set the simulated delivery status to **Delivered**, and save. Wait for the Logistics n8n execution to finish successfully. Confirm it reaches `Logistics | Record Delivered Status`, `Logistics | Reconcile Demo Payment`, and `Is Payment Consistent`. Manager should show the order **delivered** and demo payment **settled**. This step only simulates a delivery; no physical shipment occurs.
7. As the registered customer, use **Need a hand?** to create a support ticket linked to the order. From **My account**, send a follow-up on that same ticket. In n8n **Executions**, check `Support | Load Ticket and Order` → `Support | Reconstruct Thread` → `Support | Triage Ticket` → `Support | Queue Draft in Demo Outbox` succeeded, and reconstruction reports both messages. In Manager → **Support inbox**, verify the same thread, category, priority and suggested draft. In **Message outbox**, verify the draft is marked **Staff review required**. Do not send a real email for this test.
8. In Manager → **Dashboard** and **Customers**, check the order, shipment and ticket appear under the same customer. **Webhook events** should show successful deliveries. A webhook 200 by itself is insufficient; inspect the completed n8n executions and saved shop state.

The Logistics workflow polls the warehouse and delivery stages every five seconds, with up to twenty minutes for each human update. Keep the shop and tunnel running while it waits. The hourly followup's 24-hour reminder and 72-hour human review were configured but not live-observed. Local data is the ignored JSON file `data/shop.json`, written by atomic replacement; it is intended for one local server process. Vercel persistence is not yet implemented. The plan selects managed PostgreSQL for Vercel because order and stock changes need transactions across records; SQLite and Vercel instance-local files are excluded.

## What was verified

### Current clean test baseline

On 30 September 2026, the local shop database was cleared for a fresh test. Readback showed one Manager account and zero customers, orders, tickets, webhook events or notifications. All eight sample products remain at their starting stock levels so the checkout and inventory flows can be tested. Historical IDs below are evidence from the earlier end-to-end run and are no longer present. `team:start` preserves data; it does not repeat this reset.

On 30 September 2026, fresh order `LC-1008` (€44, authorized demo payment) completed checkout, customer confirmation, one stock reservation, a warehouse task, demo shipment, simulated delivery, and payment reconciliation. n8n executions `97–105` succeeded; both Manager and the signed-in customer account showed the saved delivered order. The `order` table row matched its five-field website projection. Ticket `T-103` received two follow-ups on one thread. Support executions `106–108` succeeded; `Support | Reconstruct Thread` reconstructed all three messages in execution `108`, then triage recorded high-priority delivery support and queued a staff-review draft. The Manager thread and customer-visible staff reply were browser-checked. `npm test` passed all 21 tests before this DB reconciliation.

On the DB reconciliation pass, all six hosted Data Table nodes resolved to an existing table; the stale `5hX...` and `UlO...` references were removed. `Get row(s)` now checks both order ID and customer email. The missing `Order Lookup Tool` reference now points to the published `Cosmos Shop Order Lookup` subworkflow, which reuses the existing Header Auth credential and calls the authenticated `/api/automation/order-lookup` endpoint. Direct API checks returned the order for the matching customer and `found:false` for a mismatched email; both HTTP requests returned 200. The child workflow has no webhook trigger. The Gmail trigger is explicitly disabled and disconnected, as are all email nodes. The n8n subworkflow has not been executed through the disabled AI Agent route; that original Gemini/Gmail branch is not part of the verified website support path. No real email, carrier, payment processor, or physical delivery was used.

The corrected checkpoint's 82 original nodes remain. The active order flow uses the `order` table (`2oakhQTHCbyc9DIp`), and all preserved table nodes now point to existing tables with matching columns. The live `conversation_context` table (`5F3pUUYCSQ4Uw1Z6`) is empty and contains no recovered history. The website support path persists messages with each ticket, reconstructs the thread before deterministic triage, then queues a draft. It does not yet use the source Gemini Agent or vector knowledge base. The callable lookup subworkflow exists and is wired to the preserved AI Tool node, but the Gmail/AI route stays disconnected and disabled; only the shop API contract was tested. The historical tested snapshot and `reference_docs/` are unchanged.

## Separate n8n workspace

The exports include resource references, not credential secrets or Data Table contents. A fresh workspace import has **not** been live tested.

1. Create a Header Auth credential with name `x-api-key` and the `automationKey` from your private `team.config.json` as its value.
2. Create the `order` Data Table with five String columns: `order_id`, `customer_email`, `status`, `tracking_number`, `estimated_delivery`. Also create `conversation_context` with `thread_id`, `customer_email`, `last_message`, `conversation_summary`, `requires_human` (boolean), `status`, and `information_complete` (boolean), because the preserved legacy nodes remain in the import. The current website support route does not use this table.
3. Set `n8nBaseUrl`, `orderTableId`, `conversationTableId`, `orderLookupWorkflowId`, `headerAuthCredentialId` and `headerAuthCredentialName` in `team.config.json`. Set `workflowId` to the main workflow ID after import so Manager's editor link is correct. Do not display the key.
4. Run `npm run team:configure -- https://YOUR.ngrok-free.dev`. Import `Cosmos-Shop-Order-Lookup.import.json` first as a draft, bind its Header Auth node, and publish it; record the new child workflow ID in `team.config.json`, then run `team:configure` again. Import `Cosmos-Ecommerce.import.json` as the single main workflow draft. No extra webhook path is added by the lookup child.
5. In n8n, verify both `OH Sync` nodes and the preserved order lookup node use the `order` table; the three legacy conversation nodes use `conversation_context`; every shop HTTP node uses your Header Auth credential; and the main Tool node points to the imported lookup child. Do not import the legacy canvas or original source exports as active workflows. Publish only the main workflow that owns the three webhook paths.
6. Run the demo steps above. If you use the generated paths, `team:start` sets order and support URLs; leave the separate Logistics URL empty to avoid duplicate handoffs.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Order stays received | n8n Executions; HTTP webhook acceptance does not prove downstream success |
| Shop HTTP node returns 401 | Header Auth credential and `x-api-key` value |
| Webhook returns 404 | Published workflow and production `/webhook/` path, not `/webhook-test/` |
| n8n receives HTML | Public ngrok URL and `ngrok-skip-browser-warning: true` header |
| Missing lookup rows | Both active `OH Sync` nodes bound to the five-column `order` table |
| No warehouse/shipment | Published integrated workflow, current `Workflow Config` URL, live shop and tunnel |
| Support ticket has no triage | `supportWebhookUrl`, support execution, and Header Auth on `Support | Triage Ticket` |
| Missing Google credential warning | Check that you imported the current 101-node draft, not the legacy canvas |
