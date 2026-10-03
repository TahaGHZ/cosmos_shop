# n8n workflow files

For the current hosted setup and demo steps, read [team setup](../docs/TEAM-SETUP.md). For implementation scope and remaining gaps, see the [integration plan](../docs/plans/INTEGRATION-PLAN.md).

| Location | Purpose |
| --- | --- |
| [final/](final/README.md) | Current integrated export, configurable inactive import, and historical snapshots |
| `final/Cosmos-Shop-Order-Lookup.integrated.json` | Published no-webhook shop lookup child called by the preserved AI tool node |
| [sources/](sources/README.md) | Supplied Inventory workflow and provenance for the source workflows in `reference_docs/` |
| `../reference_docs/workflows/` | Original Support, Logistics, and Order Lookup exports; preserved unchanged |
| `ready/` | Earlier prepared shop API workflow copies used by generation scripts |
| `merged/` | Historical generated exports retained for regression and source traceability; not the hosted workflow |

The authoritative supplied modules are **Inventory-Reserve-Stock-and-Create-Warehouse-Task.json**, **E-commerce (1).json**, and **Logistics-Delivery-Automation-3.json**. The Inventory Overlay is an earlier integration result, not a replacement source. Workflow exports contain resource references, not credential secrets or Data Table contents. Never activate overlapping workflows with the same webhook path.
