import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const write = (file, value) => fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
const workflow = read('n8n/final/Cosmos-Ecommerce.tested.json');
const logistics = read('n8n/ready/Logistics-Shop.json');
const config = read('team.config.json');
const byName = new Map(workflow.nodes.map((node) => [node.name, node]));
const adapted = new Map(logistics.nodes.map((node) => [node.name, node]));
const replaceNames = new Set([...adapted.keys()]);

for (const node of workflow.nodes) {
  const replacement = adapted.get(node.name);
  if (!replacement) continue;
  const preserved = { id: node.id };
  delete node.disabled;
  delete node.credentials;
  Object.assign(node, structuredClone(replacement), preserved);
  node.position = [...replacement.position];
  if (node.type === 'n8n-nodes-base.httpRequest') {
    node.credentials = {
      httpHeaderAuth: {
        id: config.headerAuthCredentialId,
        name: config.headerAuthCredentialName,
      },
    };
  }
}

const extraNames = ['Workflow Config', 'Reservation Succeeded', 'Read Warehouse From Shop', 'Read Shipment From Shop'];
for (const name of extraNames) {
  const node = adapted.get(name);
  if (!node) throw new Error(`Missing prepared logistics node: ${name}`);
  const copy = structuredClone(node);
  if (copy.type === 'n8n-nodes-base.httpRequest') {
    copy.credentials = {
      httpHeaderAuth: {
        id: config.headerAuthCredentialId,
        name: config.headerAuthCredentialName,
      },
    };
  }
  workflow.nodes.push(copy);
  byName.set(name, copy);
}

// The logistics workflow always reads from this shop. team:configure updates the
// checked-in demo URL from team.config.json before generating this draft.
const configNode = byName.get('Workflow Config');
configNode.parameters.jsCode = configNode.parameters.jsCode
  .replace(/shopBaseUrl:\s*'[^']*'/, `shopBaseUrl: ${JSON.stringify(config.shopBaseUrl)}`);
for (const name of ['OH Configuration', 'OH Followup Configuration']) {
  const node = byName.get(name);
  if (!node?.parameters?.jsCode) throw new Error(`Missing ${name} shop URL configuration`);
  node.parameters.jsCode = node.parameters.jsCode
    .replace(/shopBaseUrl:\s*'[^']*'/, `shopBaseUrl: ${JSON.stringify(config.shopBaseUrl)}`);
  if (!node.parameters.jsCode.includes(config.shopBaseUrl)) throw new Error(`Could not set shop URL in ${name}`);
}

for (const name of replaceNames) delete workflow.connections[name];
for (const [name, connections] of Object.entries(logistics.connections)) {
  workflow.connections[name] = structuredClone(connections);
}

const readableNames = new Map([
  ['Update Inventory', 'Shop reservation already updates stock'],
  ['Update Product Availability', 'Shop already saved availability'],
  ['Create Warehouse Task', 'Track shop warehouse task'],
  ['Update Order Shipped', 'Shipment already saved by shop'],
  ['Update Order In Transit', 'Transit status already saved'],
  ['Update Order Delayed', 'Delay status already saved'],
  ['Get Delivery Status', 'Check delivery status and timeout'],
]);
for (const node of workflow.nodes) if (readableNames.has(node.name)) node.name = readableNames.get(node.name);
const renamedConnections = {};
for (const [source, outputs] of Object.entries(workflow.connections)) {
  const renamedSource = readableNames.get(source) ?? source;
  renamedConnections[renamedSource] = Object.fromEntries(Object.entries(outputs).map(([kind, branches]) => [
    kind,
    branches.map((branch) => branch.map((edge) => ({ ...edge, node: readableNames.get(edge.node) ?? edge.node }))),
  ]));
}
workflow.connections = renamedConnections;
// Keep every disabled email node disconnected so downstream shop updates do
// not depend on n8n's disabled-node pass-through behavior.
workflow.connections['Shipment already saved by shop'] = {
  main: [[{ node: 'Wait Before Status Check', type: 'main', index: 0 }]],
};
delete workflow.connections['Notify Customer Shipped'];
workflow.connections['Update Order Delivered'] = {
  main: [[{ node: 'Reconcile Payment', type: 'main', index: 0 }]],
};
delete workflow.connections['Notify Customer Delivered'];
workflow.connections['Delay status already saved'] = {
  main: [[{ node: 'Wait Before Status Check', type: 'main', index: 0 }]],
};
delete workflow.connections['Notify Customer Delayed'];
workflow.connections['Is Payment Consistent'].main[1] = [
  { node: 'Escalate To Human', type: 'main', index: 0 },
];
delete workflow.connections['Notify Employee Inconsistency'];

const id = (name) => byName.get(name)?.id;
const groupDescriptions = {
  'Validate order': 'Loads the live shop order, checks payment, address and totals, blocks duplicates, and sends invalid orders to human review.',
  'Confirm stock availability': 'Checks current shop inventory and reserves it atomically through the shop API.',
  'Prepare order in warehouse': 'Creates the shop warehouse task. Staff pick, verify and pack it in Manager → Warehouse; n8n polls for ready or an issue.',
  'Ship & track delivery': 'Creates a demo shipment in the shop and polls saved delivery updates. There is no real courier or email.',
  'Confirm delivery & reconcile': 'Saves delivered status in the shop and reconciles demo payment; mismatches go to human review.',
};
for (const group of workflow.nodeGroups ?? []) {
  const descriptions = groupDescriptions[group.name];
  if (descriptions) group.description = descriptions;
  const sourceGroup = logistics.nodeGroups?.find((candidate) => candidate.name === group.name);
  if (sourceGroup) group.nodeIds = sourceGroup.nodeIds.map((nodeId) => {
    const sourceNode = logistics.nodes.find((candidate) => candidate.id === nodeId);
    return sourceNode ? id(sourceNode.name) : nodeId;
  }).filter(Boolean);
}
const handoffNote = byName.get('OH Read Me');
if (handoffNote) {
  handoffNote.parameters.content = handoffNote.parameters.content
    .replace('The original Logistics code remains mock-based by request. Its HTTP acceptance is not proof of actual fulfillment.', 'The Logistics block below now reads and updates shop records through the shop API. Courier, delivery, payment and email remain simulated. A webhook HTTP response alone does not prove downstream completion.')
    .replace('Configure both OH config nodes, the new HTTP credentials, and the lookup-table binding.', 'Configure both OH nodes, the Header Auth credential, and the lookup-table binding. The shop-backed Logistics blocks are explained in the notes below.');
}

const positions = {
  'Order Ready For Shipment': [-6400, -3900],
  'Test Manually': [-6400, -3600],
  'Workflow Config': [-6160, -3900],
  'Get Order': [-5920, -3900],
  'Validate Order': [-5680, -3900],
  'Check Duplicate': [-5440, -3900],
  'Is Order Valid': [-5200, -3900],
  'Send Order To Inventory & Warehouse': [-4960, -3900],
  'Escalate To Human': [-4960, -3500],
  'Check Stock': [-4720, -3900],
  'Is Stock Available': [-4480, -3900],
  'Reserve Stock': [-4240, -3900],
  'Reservation Succeeded': [-4000, -3900],
  'Shop reservation already updates stock': [-3760, -3900],
  'Shop already saved availability': [-3520, -3900],
  'Track shop warehouse task': [-3280, -3900],
  'Wait For Warehouse Update': [-3280, -3200],
  'Read Warehouse From Shop': [-3040, -3200],
  'Check Warehouse Status': [-2800, -3200],
  'Route Warehouse Status': [-2560, -3200],
  'Create Shipment': [-2320, -3200],
  'Get Tracking Number': [-2320, -2100],
  'Shipment already saved by shop': [-2080, -2100],
  'Notify Customer Shipped': [-1840, -2100],
  'Wait Before Status Check': [-1600, -2100],
  'Read Shipment From Shop': [-1360, -2100],
  'Check delivery status and timeout': [-1120, -2100],
  'Route Delivery Status': [-880, -2100],
  'Transit status already saved': [-640, -2450],
  'Update Order Delivered': [-640, -2100],
  'Notify Customer Delivered': [-400, -2100],
  'Reconcile Payment': [-160, -2100],
  'Is Payment Consistent': [80, -2100],
  'Notify Employee Inconsistency': [320, -2100],
  'Delay status already saved': [-640, -1750],
  'Notify Customer Delayed': [-400, -1750],
};
for (const [name, position] of Object.entries(positions)) {
  const node = byName.get(name);
  if (node) node.position = position;
}

const notes = [
  {
    name: 'LOGISTICS 1 · Validate & prevent duplicates', position: [-6500, -4500], width: 1800, height: 170,
    content: '# 1 · Validate the order\n\nWebhook → live shop lookup → address, items, total and payment checks → duplicate guard. Invalid or repeated orders go to Manager review. The shop API is the source of truth.',
  },
  {
    name: 'LOGISTICS 2 · Reserve & prepare', position: [-4600, -4500], width: 1800, height: 170,
    content: '# 2 · Reserve stock and prepare the parcel\n\nThe shop API checks live stock; reservation rechecks and deducts it atomically. A warehouse task appears in Manager → Warehouse. Staff pick, verify and pack it before marking it ready; n8n polls every 5 seconds (up to 20 minutes).',
  },
  {
    name: 'LOGISTICS 3 · Ship & track', position: [-2700, -4500], width: 1800, height: 170,
    content: '# 3 · Create a demo shipment and track it\n\nWhen warehouse status is ready, the shop creates a demo tracking number. Delivery updates are read from Manager → Shipping every 5 seconds (up to 20 minutes). No carrier is contacted and no customer email is sent.',
  },
  {
    name: 'LOGISTICS 4 · Close or review', position: [-800, -4500], width: 1800, height: 170,
    content: '# 4 · Close the order or review an exception\n\nDelivered orders update the shop and reconcile demo payment. Address, stock, warehouse, delivery and payment problems are recorded for human review in Manager → Orders. Gmail notification nodes remain disabled.',
  },
];
for (const note of notes) {
  workflow.nodes.push({
    id: crypto.randomUUID(), name: note.name, type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
    position: note.position, parameters: { content: note.content, height: note.height, width: note.width },
  });
}

// The imported copy must start as a draft. Retain webhook paths and workspace
// resource bindings so it can replace the hosted workflow after review.
workflow.active = false;
delete workflow.id;
delete workflow.versionId;
delete workflow.meta;
workflow.name = 'Cosmos Ecommerce — Orders + Logistics (shop API)';
workflow.tags = [];

const output = 'n8n/final/Cosmos-Ecommerce-logistics-ready.json';
write(output, workflow);

const errors = [];
const nodeNames = new Set(workflow.nodes.map((node) => node.name));
for (const [source, outputs] of Object.entries(workflow.connections)) {
  if (!nodeNames.has(source)) errors.push(`Unknown connection source: ${source}`);
  for (const outputList of Object.values(outputs)) {
    for (const branch of outputList) for (const edge of branch) {
      if (!nodeNames.has(edge.node)) errors.push(`${source} connects to missing node ${edge.node}`);
    }
  }
}
const logisticsHttp = workflow.nodes.filter((node) => replaceNames.has(node.name) && node.type === 'n8n-nodes-base.httpRequest');
for (const node of logisticsHttp) if (!node.credentials?.httpHeaderAuth?.id) errors.push(`Missing Header Auth on ${node.name}`);
if (!workflow.nodes.find((node) => node.name === 'Notify Customer Shipped')?.disabled) errors.push('Customer email must remain disabled');
if (!workflow.nodes.find((node) => node.name === 'Notify Employee Inconsistency')?.disabled) errors.push('Finance email must remain disabled');
if (!workflow.nodes.find((node) => node.name === 'Get Order')?.parameters.url.includes('/api/automation/orders/')) errors.push('Logistics order lookup is not using the shop API');
if (errors.length) throw new Error(`Prepared workflow checks failed:\n${errors.join('\n')}`);
console.log(`Wrote ${output}: ${workflow.nodes.length} nodes, ${logisticsHttp.length} authenticated shop API nodes, ${notes.length} canvas notes.`);
