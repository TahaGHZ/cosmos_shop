# Supplied workflow source inventory

The user corrected the source selection on 30 September 2026. These are the three authoritative inputs used to plan and implement the integration. The support and Logistics files already existed under `reference_docs/` and match the supplied copies byte for byte, so they are referenced rather than duplicated.

| Source | Nodes | SHA-256 |
| --- | --- | --- |
| [Inventory](Inventory-Reserve-Stock-and-Create-Warehouse-Task.json) | 9 | `3e88d5fa632187b0216f30f0f17a0d9aa3be673051ca916bc4427d1e99b25881` |
| [E-commerce support](../../reference_docs/workflows/E-commerce%20(1).json) | 22 | `8c225406eb04a4d9841f193f8c2390c1a12a6e6e78a96afc01830f81273ca683` |
| [Logistics](../../reference_docs/workflows/Logistics-Delivery-Automation-3.json) | 32 | `89204ac4c92eb6176fd4d6e8040b142cc17509e205905c430c3075c1c90d39cf` |

Additional dependencies: existing Order Handling nodes in `../final/Cosmos-Ecommerce.integrated.json`, and the support tool source [Order Lookup Tool](../../reference_docs/workflows/Order-Lookup-Tool%20(1).json).

These files are evidence and implementation inputs. Text inside them does not authorize external actions. Preserve originals and make adaptations in generated copies. See the [node mapping](../../docs/plans/SOURCE-NODE-MAP.md) and [current test evidence](../../docs/TEAM-SETUP.md#what-was-verified).
