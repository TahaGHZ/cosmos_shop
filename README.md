# Cosmos / Larkspur demo shop

Fake ecommerce shop for the team's n8n automation. Node.js **22+**, no install or build step. Start here; older setup routes are archived.

## Run with the tested shared n8n workspace

1. In one terminal: `ngrok http 3000`. Copy your HTTPS forwarding URL.
2. In another terminal, from this folder:

   ```powershell
   npm run team:start -- https://YOUR.ngrok-free.dev
   ```

3. In the [published Cosmos-Ecommerce workflow](https://cosmos-team-5ia.app.n8n.cloud/workflow/mPhy7IFRIz30yzKq), replace `shopBaseUrl` in **OH Configuration** and **OH Followup Configuration** with that URL, then **Publish**.
4. Open your ngrok URL and test checkout. Keep both terminals running.

The launcher saves your URL in `team.config.json`, preserves the shared demo API key, configures shop webhooks, and generates `n8n/final/Cosmos-Ecommerce.import.json`. Existing orders/accounts are retained. Stop an older shop process with Ctrl+C before launching; do not run two processes against the same data folder.

| Account | Email | Password |
| --- | --- | --- |
| Admin | admin@example.com | Admin123! |
| Customer | customer@example.com | Customer123! |

Local pages: [shop](http://localhost:3000), [admin](http://localhost:3000/admin), [account](http://localhost:3000/account). New customer registration is available.

## Test

Sign in as the demo customer → add an in-stock product → fill street/city/postal code/country → choose **Successful** demo payment → place order. After a few seconds, refresh the order: **awaiting confirmation**. Click **Yes, confirm my order**. Check n8n **Executions** for successful ordering and Logistics runs.

Verified live on 29 September 2026: **LC-1002**, €44 total, received → awaiting confirmation → confirmed → accepted Logistics handoff. Executions #1–#4 succeeded. The lookup table showed `LC-1002 / customer@example.com / confirmed`.

**Logistics uses the original mocks:** success does not update website shipment/delivery. Real email nodes and Gmail polling are disabled. No real payments or deliveries occur.

## Team files

| File | Purpose |
| --- | --- |
| `n8n/final/Cosmos-Ecommerce.tested.json` | Exact export downloaded from the tested published workflow; 82 nodes, bindings and disabled flags retained |
| `n8n/final/Cosmos-Ecommerce.import.json` | Generated import copy with your configured URLs; starts as a draft |
| `team.config.json` | Shared demo API key, URLs and n8n resource IDs; intentionally retained for this team demo |
| [docs/TEAM-SETUP.md](docs/TEAM-SETUP.md) | Import into another n8n workspace, troubleshooting, and connection details |
| [AGENTS.md](AGENTS.md) | Short technical handoff for coding assistants |
| `reference_docs/` | Original supplied workflows/specifications, unchanged |
| `docs/archive/`, `n8n/ready/`, `n8n/merged/` | Historical documentation and alternative exports; use final/ for the tested setup |

The demo key is included at your request. Google/Gmail secrets are not in workflow JSON; their credential references remain, and those branches are outside the tested ordering setup. Use the team's private copy of this demo configuration.

## Development

`npm test` runs the API/account/merge checks. `npm start` starts the server without team setup. Data persists in ignored `data/shop.json`; sessions expire on restart. Environment options and API contracts are summarized in [AGENTS.md](AGENTS.md).
