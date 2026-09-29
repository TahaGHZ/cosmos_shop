import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'team.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const start = process.argv.includes('--start');
const args = process.argv.slice(2).filter(a => a !== '--start');
if (args.length > 1) throw new Error('Usage: npm run team:configure -- https://YOUR.ngrok-free.dev');
if (args[0]) config.shopBaseUrl = args[0];
for (const key of ['shopBaseUrl', 'n8nBaseUrl']) {
  const url = new URL(config[key]);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${key} must be an HTTP(S) origin, without a path or credentials`);
  }
  config[key] = url.origin;
}
if (!config.automationKey || !config.orderTableId || !config.headerAuthCredentialId) throw new Error('Missing team configuration');
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

// Generate a copy; never rewrite the exact export captured after the live test.
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/final/Cosmos-Ecommerce.tested.json'), 'utf8'));
for (const name of ['OH Configuration', 'OH Followup Configuration']) {
  const node = workflow.nodes.find(n => n.name === name);
  const code = node.parameters.jsCode;
  const replaced = code.replace(/shopBaseUrl:'[^']*'/, `shopBaseUrl:${JSON.stringify(config.shopBaseUrl)}`);
  if (replaced === code) throw new Error(`Cannot locate shopBaseUrl in ${name}`);
  node.parameters.jsCode = replaced;
  if (name === 'OH Configuration') node.parameters.jsCode = node.parameters.jsCode.replace(/logisticsWebhookUrl:'[^']*'/, `logisticsWebhookUrl:${JSON.stringify(config.n8nBaseUrl + '/webhook/order-ready-for-shipment')}`);
}
for (const node of workflow.nodes) {
  if (['OH Sync Lookup Table', 'OH Sync Confirmation State'].includes(node.name)) node.parameters.dataTableId = { __rl: true, mode: 'id', value: config.orderTableId };
  if (node.name.startsWith('OH ') && node.credentials?.httpHeaderAuth) node.credentials.httpHeaderAuth = { id: config.headerAuthCredentialId, name: config.headerAuthCredentialName };
}
// Importing creates a draft to publish intentionally; credentials/table references remain.
workflow.active = false;
delete workflow.id;
delete workflow.versionId;
const importPath = path.join(root, 'n8n/final/Cosmos-Ecommerce.import.json');
fs.writeFileSync(importPath, JSON.stringify(workflow, null, 2) + '\n');
console.log(`Shop URL: ${config.shopBaseUrl}\nImport: ${importPath}`);

if (start) {
  process.env.API_KEY = config.automationKey;
  process.env.N8N_WEBHOOK_URL = config.n8nBaseUrl + '/webhook/larkspur-order-handling';
  process.env.PUBLIC_BASE_URL = config.shopBaseUrl;
  const storePath = path.join(process.env.DATA_DIR || path.join(root, 'data'), 'shop.json');
  if (fs.existsSync(storePath)) {
    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    Object.assign(store.settings, { automationKey: config.automationKey, webhookUrl: process.env.N8N_WEBHOOK_URL, publicBaseUrl: config.shopBaseUrl, logisticsWebhookUrl: '', supportWebhookUrl: '' });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  }
  await import('../server.js');
}
