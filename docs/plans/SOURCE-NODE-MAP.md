# Source node mapping

Status: preservation and gap-tracking map. The integration work is approved; this table records the intended business role of each supplied source node and distinguishes that target from the currently verified hosted path. Check [integration status and test evidence](INTEGRATION-PLAN.md) before treating a mapped destination as implemented. Source hashes and file links are in the [source inventory](../../n8n/sources/README.md).

Keep original exports unchanged. A transport/storage adaptation may change a node type in the generated workflow, but must retain its business purpose, traceable source identity and connected destination. Core modules must not be represented only by disconnected disabled copies. Email channel definitions remain preserved while demo output uses the website.

## Inventory — 9 nodes

All destinations below belong to Inventory & Warehouse.

| Source node | Proposed destination behavior |
| --- | --- |
| Webhook | Preserve `warehouse/new-order`; authenticate and normalize `order_id`, `items`, event/correlation IDs |
| Split Out Items | Keep item expansion; validate quantities and combine repeated SKUs before expansion |
| Get Product | Adapt Data Table lookup to persistent website product lookup, preserving source stock fields |
| Check Stock | Keep per-line/all-order sufficiency result; website transaction rechecks before writing |
| Enough Stock? | Preserve success/shortage branches |
| Reserve Stock | Adapt row writes to one atomic, repeat-safe reservation for the whole order |
| Create Warehouse Task | Aggregate line results first, then create/retrieve exactly one task per order |
| Respond Reserved | Preserve JSON response with order, reserved status and task ID; include reservation ID |
| Respond Stock Issue | Preserve HTTP 409 and shortage details; Logistics handles this as a business outcome |

## Logistics — 32 nodes

All destinations below belong to Logistics & Delivery. Inventory performs the actual reservation; Logistics consumes and verifies its result.

| Source node | Proposed destination behavior |
| --- | --- |
| Order Ready For Shipment | Preserve `order-ready-for-shipment`; accept confirmed-order event |
| Get Order | Replace hardcoded order/scenario with website lookup |
| Test Manually | Preserve manual entry; require an explicit demo order |
| Validate Order | Preserve customer/address/item/status/payment checks; account for shipping in totals |
| Check Duplicate | Replace hardcoded processed IDs with persisted fulfillment/idempotency lookup |
| Is Order Valid | Preserve validation pass/review branches |
| Send Order To Inventory & Warehouse | Call Inventory webhook with mapped `items[{sku,qty}]`; capture success/409 |
| Check Stock | Validate stock result returned by Inventory instead of mock levels |
| Is Stock Available | Preserve success/stock-review routing |
| Reserve Stock | Confirm Inventory reservation receipt; do not deduct stock a second time |
| Update Inventory | Synchronize/verify persisted reservation and movement result |
| Update Product Availability | Read/publish resulting available quantities and availability state |
| Create Warehouse Task | Retrieve/verify the task returned by Inventory; do not create a second task |
| Wait For Warehouse Update | Preserve wait loop with explicit interval/deadline |
| Check Warehouse Status | Read staff-updated task state; preserve timeout and issue distinctions |
| Route Warehouse Status | Preserve ready, in-progress, issue and unknown routes |
| Create Shipment | Create/retrieve one persistent demo shipment after the ready gate |
| Get Tracking Number | Keep tracking fields; use website tracking URL rather than fabricated courier URL |
| Update Order Shipped | Persist/synchronize shipped state through a repeat-safe API |
| Notify Customer Shipped | Preserve template/stage; write demo notification to website; Gmail channel stays disabled |
| Wait Before Status Check | Preserve wait loop with explicit interval/deadline |
| Get Delivery Status | Read saved delivery updates instead of inventing progress from the check counter |
| Route Delivery Status | Preserve in-transit, delivered, delayed, exception and unknown routes |
| Update Order In Transit | Persist/synchronize state and its event history |
| Update Order Delivered | Persist delivered state and timestamp |
| Notify Customer Delivered | Preserve template/stage as website demo notification |
| Reconcile Payment | Compare actual stored demo transaction amount/currency/status with order total |
| Is Payment Consistent | Preserve success/inconsistency branches; record completion on success |
| Notify Employee Inconsistency | Create a manager payment-review notification with discrepancy details |
| Escalate To Human | Create/update a manager case with validation, stock, warehouse, delivery or payment reason |
| Update Order Delayed | Persist delayed state and retain polling/deadline context |
| Notify Customer Delayed | Preserve template/stage as a repeat-safe website notification, then continue polling |

## Customer Support — 22 nodes

All destinations below belong to Customer Support, except the called Order Lookup workflow. The original prompts remain the starting point; input expressions change to normalized website/Gmail context.

| Source node | Proposed destination behavior |
| --- | --- |
| Gmail Trigger | Preserve optional intake; keep disabled in demo. Add website webhook and shared normalization before context lookup |
| Message a model | Preserve Gemini classifier prompt and six categories; validate JSON before use |
| Switch | Preserve all six categories; add an explicit recorded outcome for the currently unconnected Other output |
| AI Agent | Preserve prompt, factual-answer rules, review boundaries and connected model/tools |
| Google Gemini Chat Model | Rebind existing Gemini credential; verify selected model availability |
| Simple Vector Store | Preserve knowledge ingestion role; track successful load/version and reload needs |
| Download file | Preserve Drive document ingestion; add an explicit refresh trigger and verify access |
| Extract from File | Preserve text extraction |
| Default Data Loader1 | Preserve document loader connection to ingestion store |
| Embeddings Google Gemini | Preserve ingestion embeddings; verify credential/model availability |
| Simple Vector Store1 | Preserve Agent knowledge retrieval tool and matching store key |
| Embeddings Google Gemini1 | Preserve retrieval embedding configuration compatible with ingestion |
| Send a message1 | Preserve human-review notification content/condition; write a website manager case and alert in demo |
| If | Preserve `requires_human` branch |
| Call 'Order Lookup Tool' | Restore callable workflow; supply trusted customer identity alongside model-selected order ID |
| Get row(s)1 | Preserve conversation lookup semantics via persistent website context API; handle no prior row |
| If1 | Preserve existing/new conversation split |
| Reply to a message | Preserve reply stage; store draft/website reply according to review mode, with Gmail sending disabled in demo |
| Insert row1 | Preserve initial conversation creation and seven source context fields; enforce unique conversation identity |
| Edit Fields1 | Preserve previous summary/message preparation |
| Update row(s)1 | Persist classification, summary and completeness without losing parallel follow-up messages |
| If2 | Preserve information-completeness gate for manager notification |

## Additional Order Handling and tool preservation

The 63-node count covers only the three corrected source files. Keep the existing Order Handling stages: receive/configure event, fetch current order, decide action, sync lookup, route/validate, check stock, request confirmation, sync confirmation, hand off to Logistics, record acceptance, request human review and scheduled followups.

Retain current order webhook ownership on the existing workflow ID. Distinguish accepted handoff from completed Logistics. The callable `Cosmos Shop Order Lookup` workflow (`8cf0BBVr8yhEylqW`) now uses the website's authenticated `/api/automation/order-lookup` endpoint; it requires both `order_id` and trusted `customer_email`. The parent AI Tool node references this workflow. The API was checked with a matching and mismatched customer; the disabled Gmail/AI branch itself has not been run. Neither moving a webhook nor adapting a lookup permits removal of the business step it served.

Implementation evidence must add final workflow/node IDs, change descriptions, validation results and execution references to this mapping after approval.
