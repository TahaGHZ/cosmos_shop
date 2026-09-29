# Connect your workflows to the shop

The reference exports are untouched in `reference_docs/workflows/`. Adapted, inactive copies are in `n8n/ready/`. No workflow was imported into your n8n instance and no emails were sent.

## Accounts and server restart

Restart your existing shop process: Ctrl+C, then `npm start`. The running Node process must restart to load the new account/API code. Your existing JSON data is preserved and demo accounts are added on first startup.

| Role | Email | Password | Access |
| --- | --- | --- | --- |
| Admin | admin@example.com | Admin123! | Orders, stock, warehouse, courier updates, support, webhook settings |
| Customer | customer@example.com | Customer123! | Own orders, confirmation/cancellation before shipping, support tickets and replies |

Visit `/login`. You can also register additional customers. Registration always creates a customer, regardless of a submitted role. Passwords are salted and hashed. Cookies are HttpOnly, and browser sessions expire after 12 hours or server restart. `ADMIN_PASSWORD` / `CUSTOMER_PASSWORD` override the demo passwords only when accounts are initially created. These are demo accounts, not a production identity system (no password reset, email verification, or rate limiting).

Old orders remain visible to admins; customers see only orders matching their account email. Old orders with incomplete structured addresses should be replaced with a fresh checkout order for the supplied Logistics validator.

## Common configuration — do this first

1. Sign in as admin → **Connect n8n**. Copy the **Automation API key**.
2. In n8n, create a **Header Auth** credential named e.g. `Larkspur Shop API`:
   - Name: `x-api-key`
   - Value: the key from the admin page.
3. Import the adapted JSON files. On **every HTTP Request node**, select this Header Auth credential. API keys and Google credentials are deliberately excluded from exports.
4. Set the shop base URL where indicated below. Defaults use `http://host.docker.internal:3000`, appropriate for many Windows Docker setups. Use `http://localhost:3000` for n8n running directly on this PC, or your ngrok HTTPS URL for hosted n8n. It must be reachable **from n8n**, not merely from your browser.
5. For ngrok, run `ngrok http 3000` separately, then save the same forwarding URL as the shop's **Public shop URL**. Update both the workflows and this setting if the forwarding address changes.

The workflow copies use a configured URL rather than trusting arbitrary URLs in webhook payloads. If you configure `WEBHOOK_SECRET`, use matching Header Auth on incoming n8n Webhook nodes (`x-webhook-secret`). The outgoing API credential and incoming webhook credential are distinct. Publish workflows before using their production URLs; test URLs require n8n to be listening for a test event.

## 1. Ordering-Shop.json

Use this instead of the earlier `n8n/larkspur-order-workflow.json` import; both now contain the updated ordering logic.

- **Choose order action**: replace `http://host.docker.internal:3000` with your reachable shop URL.
- **Update demo shop**: select the Shop API Header Auth credential.
- Publish it and paste its production webhook URL in the shop's **Ordering webhook URL**.

Behavior: `order.created` validates payment and waits for customer confirmation. The confirmation link is in the simulated outbox and the `order.validated` event. Customers can also confirm from My account → View order.

When **Logistics webhook URL** is configured, the shop sends `order.confirmed` to Logistics. Ordering does **not** reserve, ship, or reconcile that order. Without a Logistics URL, it retains the original all-in-one demo behavior.

No confirmation email node is supplied. Add your own email node on `order.validated` using `order.customer.email` and `order.confirmation_url` if you want real delivery. The shop stores a simulated message either way.

## 2. Order-Lookup-Shop.json

Import this subworkflow first, then select it in both support workflows' **Call 'Order Lookup Tool'** node.

- **Workflow Config**: set `shopBaseUrl`.
- **Get row(s)**: now an HTTP Request (the original name is retained), POST `/api/automation/order-lookup`. Select the API credential. The old `order` data table is no longer needed for lookup.
- Trigger inputs are now **order_id** and **customer_email**. IDs are strings such as `LC-1001`.
- **Edit Fields** passes through the verified lookup result.

Success returns `found`, `order_id`, `customer_email`, `status`, `tracking_number`, `estimated_delivery`, `carrier`, and `payment_status`. Unknown IDs or a mismatched email return `{found:false,message:...}` without another customer's data. Pre-shipment tracking/ETA are null, not invented.

Bind `customer_email` to the actual message sender / authenticated website ticket. It must not be generated using `$fromAI`. The prepared support copies already make that distinction. For Gmail, the sender check is a demo consistency check, not strong identity verification for sensitive actions.

## 3. Logistics-Shop.json

- **Workflow Config**: set `shopBaseUrl`.
- All HTTP Request nodes: select the API credential.
- Publish the POST `/webhook/order-ready-for-shipment` trigger; paste its production URL in **Logistics webhook URL** in the shop.
- For a manual test, replace `SET_ORDER_ID_FOR_MANUAL_TEST` in **Get Order** with an actual confirmed shop order ID. The manual trigger has no incoming webhook body.

What changed from Logistics-Delivery-Automation-3.json:

| Original node | Prepared behavior |
| --- | --- |
| Get Order | GET live order contract; no Jane Doe, hard-coded products, or fallback order |
| Validate Order | Uses actual structured checkout address, payment, and prices; adds `shipping_amount` to item totals |
| Check Duplicate | Checks whether a shipment already exists; removes mock `ORD-9999` list |
| Check Stock | GET live stock check, using actual product IDs as SKUs |
| Reserve Stock | POST atomic reservation; retries cannot deduct stock twice |
| Reservation Succeeded (new) | Routes unsuccessful reservation to human review |
| Update Inventory / Update Product Availability | Pass through; the shop already updates stock atomically during reservation |
| Create Warehouse Task | Reads the task created by reservation, rather than creating a fake `WH-TASK-001` |
| Read Warehouse From Shop (new) | GET actual warehouse state |
| Check Warehouse Status | Uses real state and a polling counter; never auto-packs the order |
| Create Shipment | POST demo shipment; persisted tracking number is unique per order |
| Get Tracking Number | Uses the real demo tracking URL and fields |
| Update Order Shipped | Pass through; Create Shipment already persisted shipped status |
| Read Shipment From Shop (new) | GET actual demo courier state |
| Get Delivery Status | Uses real state; no invented movement or scenario transitions |
| Update Order In Transit / Delayed | Pass through; the observed courier state is already in the shop |
| Update Order Delivered | POST delivered state, idempotently |
| Reconcile Payment | POST fresh payment reconciliation against the shop record, rather than stale Get Order data |
| Escalate To Human | Records the review reason in order history in admin operations |

Warehouse and shipment polling intervals are explicitly five seconds, with a maximum of 240 checks (about 20 minutes per stage). Increase the limit/interval in the respective nodes for a longer workshop. Timeout and exception branches go to admin review. This sample does not persist n8n execution claims; avoid replaying a confirmation event while the same order already has a running Logistics execution. API writes are guarded, but concurrent workflow executions could still duplicate external notifications if you enable them.

**Human steps:** admin opens order, checks picked/verified/packed and marks ready. Logistics then creates a shipment. Admin later applies a demo courier status (delayed, delivered, exception). Polling observes those updates. Do not mark an order shipped manually if you want to test the complete automatic shipment step.

All Gmail notification nodes in the adapted Logistics export are **disabled**. This avoids sending to the personal addresses embedded in the reference export. Before enabling real email: select your Gmail credential, replace the employee recipients, verify the customer emails, and ensure execution deduplication suits your demo. The shop's own outbox remains simulated.

## 4. E-commerce-Gmail-Shop.json

This keeps the original email-based support workflow, with shop-backed order lookup.

- Select your Gmail, Gemini, Google Drive, and embedding credentials on the corresponding nodes.
- In **Call 'Order Lookup Tool'**, select the imported **Order Lookup Tool — Shop API** workflow and refresh its input schema if n8n prompts. Verify both inputs are mapped. `order_id` is from AI; `customer_email` is from Gmail Trigger.From.
- On **Get row(s)1**, **Insert row1**, and **Update row(s)1**, select/create your `conversation_context` Data Table.
- Required table columns: `thread_id` (string), `customer_email` (string), `last_message` (string), `conversation_summary` (string), `requires_human` (boolean), `status` (string), `information_complete` (boolean).
- Sender extraction now supports both `Name <email@example.com>` and bare addresses.
- Select the KB file in **Download file**, then run the **Load KB Manually** trigger to populate the Simple Vector Store before testing the agent. The extraction/vector indexing branch stays separate from incoming messages. Repeat after an n8n restart because the store is in memory.
- **Reply to a message** and **Send a message1** are disabled by default. Review recipients and credentials, then enable them when you want actual emails.
- Publish only once those bindings are complete.

This workflow still listens to Gmail. Website messages do not create Gmail messages automatically. Use the next workflow for website tickets, or build an explicit email bridge if that is your preferred channel.

## 5. E-commerce-Website-Shop.json

This is an additional copy of the same classification/agent support logic for the website.

- **Support Input**: set `shopBaseUrl`.
- All HTTP Request nodes: select the API credential.
- Select the imported lookup workflow, Gemini/embedding credentials, conversation_context table, and KB file as above.
- Publish it and paste its production `/webhook/larkspur-support` URL in **Website support webhook URL**.

Website Support Webhook accepts the shop's `support.created` event. **Support Input** normalizes its authenticated ticket into message ID, sender, subject, text, and `website:T-...` conversation ID. An order reference from the form is appended to the message so the agent sees it.

**Reply to a message** is now POST `/api/support/:id/replies`; the reply appears in the customer's account. **Send a message1** is now a PATCH that escalates the ticket in admin operations. Neither sends email. The agent's human-review classification sets escalated/resolved state. This demo supports separate tickets rather than a chat stream; later support-form submissions create new tickets.

## Test sequence

1. Restart the shop; import and configure Ordering, Lookup, Logistics, and one or both support copies.
2. Sign in as customer, add a product, fill street/city/postal code/country, and place a successful demo payment order.
3. Verify validation in n8n, then confirm from the customer's order page.
4. Verify Logistics fetched the same order and reserved stock. As admin, finish the warehouse checklist.
5. Verify shipment appears; as admin, set delivered. Verify payment is settled.
6. As customer, submit “Where is my order?” with the order reference. Verify the website support response appears in My account.
7. Try a lookup with a different customer's email; it must return found=false.

Run `npm test` for local API/authentication/contract checks. Prepared JSON, expressions, and API contracts are checked locally; importing/executing with your actual n8n credentials and model configuration still needs the sequence above. A delivered webhook means n8n accepted the request, not that its whole execution succeeded.

## Official node references

- [HTTP Request and Header Auth](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [Webhook test versus production URLs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [Wait node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/)
- [Call n8n Workflow Tool inputs](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolworkflow/)
