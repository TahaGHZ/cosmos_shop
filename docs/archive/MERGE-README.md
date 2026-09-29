# Original workflows merged, plus new order handling

## Files

- **E-commerce-All-In-One.json**: one n8n editor import containing all 57 original nodes, a new 23-node order handler, and the complete original `order_flow.md` and `tasks.txt` in sticky notes.
- **Order-Handling.json**: the new order handler alone, useful if your original support/Logistics/Lookup workflows are already imported separately.
- **Original-Workflows-Bundle.json**: a JSON array containing the three complete original workflow objects, including their original workflow IDs and metadata. This is an archive/bulk-import bundle, not a single-workflow editor import.
- **preservation-report.json**: original file hashes and preservation checks.

Import either the All-In-One workflow **or** Order-Handling, not both with the same webhook path.

## What “unchanged” means

Every original node object is preserved exactly, including ID, name, position, code, prompts, node parameters, credentials, flags, webhook IDs, and settings. Existing connections, node groups, pin data, and the common workflow settings are preserved. The source files are never written. The two Markdown documents appear verbatim in new reference notes.

The merged workflow needs its own name and wrapper metadata and starts inactive. The complete original top-level workflow objects are preserved in the bundle. Original node coordinates are retained even where the three original canvas layouts overlap. New order-handling nodes are placed below them, around Y=4000; the reference documents are between the original and new sections. A visually rearranged version would require changing node positions, which this export deliberately does not do.

No internal original connection is rewired. The new order handler reaches Logistics through its existing webhook. The support agent's existing **Call 'Order Lookup Tool'** still refers to its original external workflow ID. Placing the Lookup nodes on the merged canvas does not redirect that reference. Keep the original lookup subworkflow available in the same n8n instance; if importing into another instance, you must bind the original workflow/table/Google credentials there yourself.

## Configure only the NEW order handler

1. In **OH Configuration**, set:
   - `shopBaseUrl`: a shop address reachable from n8n. Default `http://host.docker.internal:3000`; use `http://localhost:3000` for directly local n8n, or your ngrok URL for hosted n8n.
   - `logisticsWebhookUrl`: the production URL of the existing **Order Ready For Shipment** trigger. In the merged workflow this trigger remains `/webhook/order-ready-for-shipment`. Use the merged trigger URL if importing All-In-One, or the original Logistics URL if importing only Order-Handling. Do not leave the placeholder.
2. In **OH Followup Configuration**, set the same `shopBaseUrl`. Defaults: reminder after 24 hours, human review after 72 hours, checked hourly. The shop enforces a 24-hour reminder cooldown.
3. On the new HTTP Request nodes that call the shop, select a Header Auth credential with name `x-api-key` and the automation key from **Admin → Connect n8n**. **OH Hand Off To Original Logistics** calls n8n rather than the shop, so do not give it the shop credential; configure webhook authentication there only if your existing webhook requires it.
4. On **OH Sync Lookup Table** and **OH Sync Confirmation State**, select the same n8n `order` Data Table that the original **Get row(s)** Lookup node uses. The supplied original table reference is preserved as the default. Required columns are `order_id`, `customer_email`, `status`, `tracking_number`, `estimated_delivery`; use text columns, including `order_id`, because the shop uses references such as `LC-1001`. If your existing table uses numeric order IDs, its schema needs to support the shop IDs before running this new handler.
5. **OH Send Confirmation Email** is a new, disabled Gmail node. Select your Gmail credential and enable it only if you want real confirmation emails. The shop always stores a simulated confirmation message in its outbox. The original Gmail nodes remain exactly as supplied; they are not disabled or changed by this merge.
6. Publish the merged workflow or standalone order handler. In the shop's **Ordering webhook URL**, paste its production `/webhook/larkspur-order-handling` URL.
7. Leave the shop's **Logistics webhook URL empty** for this configuration. That allows `order.confirmed` to return to the new order handler, which performs its stock check and calls the original Logistics URL configured in step 1. Setting the shop Logistics URL directly would bypass that new confirmed-order branch. Do not point that field at the original Logistics endpoint while also expecting the new handler to process confirmation.
8. Restart the shop server with Ctrl+C, then `npm start`, to load the new reminder and handoff-record endpoints. Existing accounts and orders remain.

The retained original support workflow remains Gmail-based. Website support messages are not converted into Gmail messages by this unchanged merge. The earlier adapted website-support export remains available separately in `n8n/ready/` if you need that channel.

## New order handling behavior

- Receives `order.created` and other shop lifecycle events. It uses a fresh authorized shop lookup rather than trusting event snapshots.
- Updates the original Lookup table with the live order fields, so existing support lookup can see orders created by the website. Missing tracking/ETA remain empty.
- New orders must have customer details, a complete structured shipping address, valid products/quantities/prices, a consistent total **including shipping**, and a successful simulated payment.
- Checks current stock before requesting confirmation. Invalid orders and unavailable stock go to a recorded human-review reason in admin order history.
- Calls the shop's validate action to move the order to awaiting confirmation. The existing shop confirmation link/button confirms it.
- For a confirmed order, checks stock again and sends its ID and order payload to the original Logistics webhook.
- Records an accepted handoff in the shop only after that webhook responds successfully. Later duplicate confirmed events skip another handoff once this receipt exists. A failure between acceptance and recording, or concurrent executions, can still duplicate downstream external side effects; the receipt is not an execution lock.
- Runs hourly to create simulated confirmation reminders for pending orders, or record a human-review reason after the configured deadline. No automatic cancellation is performed merely because the customer did not answer. Customers may reject by cancelling through their order page.
- Other supported lifecycle events only refresh the Lookup table; they do not repeat order creation/validation or fulfillment.

Webhook acceptance is a receipt, not proof that the Logistics workflow finished successfully. Inspect n8n execution history. Recorded reminder messages appear in the demo outbox; they are not automatically emailed by this new scheduler.

## Consequences of preserving the original Logistics workflow

The original **Get Order**, stock/warehouse/shipment updates, and payment reconciliation are still mock-based. **Get Order** accepts the incoming order ID but creates its own hard-coded customer/products/amount. It ignores the real order payload sent by the new handler. Its warehouse/courier progress is simulated and its status updates do not write back to the shop or the lookup table.

Therefore, this unchanged merge does **not** turn the original Logistics demo into live shop fulfillment. Real shop inventory and shipment records will not advance simply because its mock nodes say “delivered.” This is the unavoidable boundary of retaining those nodes unchanged. The previously prepared `n8n/ready/Logistics-Shop.json` provides actual shop API reads/writes if you later choose to use an adapted version.

Existing credential/table/workflow references, hard-coded email recipients, and pinned mock order 12345 are all still present. Nothing was activated, imported remotely, or sent while creating these files.

## Verification and regeneration

```powershell
node scripts/merge-original-workflows.js
npm test
```

The generator asserts exact equality of original node objects/connections and verifies source file hashes. Tests cover those preservation claims, new routing/validation decisions, reminder cooldown, and handoff receipts. Workflow graphs and JavaScript syntax are checked locally. Live n8n import/execution still requires your existing credentials, tables, and external lookup binding.

References: [n8n Data Table upsert](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable/) and [Schedule Trigger publication](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/).
