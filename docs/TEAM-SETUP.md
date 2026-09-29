# Team setup

Read `README.md` first. The fastest route reuses the published shared workspace: only the ngrok URL changes in the launcher and two OH configuration nodes. One shared workflow targets one teammate's running shop at a time.

## Connections already retained

| Resource | Value |
| --- | --- |
| n8n | https://cosmos-team-5ia.app.n8n.cloud |
| Workflow | `mPhy7IFRIz30yzKq` / Cosmos-Ecommerce |
| Ordering production webhook | `/webhook/larkspur-order-handling` |
| Logistics production webhook | `/webhook/order-ready-for-shipment` |
| Order data table | `2oakhQTHCbyc9DIp` / order |
| Header Auth credential | `UgB67LNiMKERsMAQ` / Header Auth account |
| Header name | `x-api-key` |
| Header value | `automationKey` in `team.config.json` |

Shop Admin → Connect n8n must use the ordering production URL, your public ngrok URL, and **empty Logistics and Website support URLs**. `team:start` sets these automatically. OH performs the Logistics handoff itself.

## Import on a separate n8n workspace

Workflow JSON preserves credential references, not the underlying secrets, accounts or Data Tables. These IDs belong to the shared workspace; another instance needs its own resources.

1. Create a Header Auth credential: Name `x-api-key`, Value from `team.config.json` → `automationKey`.
2. Create Data Table `order`. All five columns are **String/Text**: `order_id`, `customer_email`, `status`, `tracking_number`, `estimated_delivery`.
3. Edit `team.config.json`: set your `n8nBaseUrl`, `orderTableId`, `headerAuthCredentialId` and `headerAuthCredentialName`. Keep the demo key unchanged.
4. Run `npm run team:configure -- https://YOUR.ngrok-free.dev`. Import **only** `n8n/final/Cosmos-Ecommerce.import.json` into a new workflow. Do not also import older ordering exports with the same webhook paths.
5. Verify both OH Data Table nodes select your table and all seven OH shop HTTP nodes select your Header Auth credential. **OH Hand Off To Original Logistics** has no shop credential.
6. Keep disabled nodes disabled. Original support nodes still reference Google credentials/external workflows from the source instance. If n8n reports missing credentials on an unused support node, deactivate that node; support requires its own setup.
7. Publish. Copy the production URLs from **OH Receive Order Event** and **Order Ready For Shipment**. The generated defaults assume the standard `/webhook/` paths above; if your instance uses different URLs, set `logisticsWebhookUrl` in OH Configuration and the shop Ordering URL accordingly.
8. Start the shop with `npm run team:start`; test as described in README.

Never import a second active copy with the same webhook paths in the shared workspace. The exact tested export is a reference snapshot; the generated import is a configurable draft. A fresh-instance import was not tested in the hosted live run.

## Credential nodes

OH Get Live Order, OH Check Stock, OH Set Awaiting Confirmation, OH Record Accepted Handoff, OH Request Human Review, OH List Pending Orders, OH Apply Followup.

## Expected behavior and limits

- Creation: live order lookup → table sync → payment/address/total validation → stock check → awaiting confirmation.
- Confirmation: table sync → stock check → original Logistics webhook → recorded accepted handoff.
- Hourly follow-up: simulated reminder after 24h, human review after 72h. These timings were not live-tested.
- Disabled: Gmail Trigger, Message a model, Download file, Embeddings Google Gemini, Send a message1, Reply to a message, Escalate To Human, Notify Customer Shipped/Delivered/Delayed, Notify Employee Inconsistency, OH Send Confirmation Email.
- Original Logistics constructs mock order/stock/shipment/payment records. Website stays confirmed; tracking fields remain empty. `n8n/ready/Logistics-Shop.json` is an alternative for future live shop fulfillment, not the tested merged setup.
- Gmail support is unconfigured; its external Lookup workflow and conversation-table references are preserved. Website support is not connected to it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Order stays received | Inspect n8n execution; webhook HTTP acceptance alone does not prove success |
| 401 on shop HTTP node | Select Header Auth; header name `x-api-key`; match `automationKey` |
| 404 webhook | Publish and use production `/webhook/`, not `/webhook-test/` |
| HTML instead of JSON | Check ngrok forwarding and `ngrok-skip-browser-warning: true` header |
| Missing table | Bind both OH sync nodes to your five-column table |
| Missing Google credential | Keep unused support nodes deactivated |
| URL changed | Rerun team:start with the new URL; update both OH config nodes and republish |
| No website shipment | Expected with preserved mock Logistics |

Detailed earlier API/adaptation notes and live evidence are retained in `docs/archive/` for reference. They describe alternative setup routes; final/ and this guide take precedence for the tested demo.
