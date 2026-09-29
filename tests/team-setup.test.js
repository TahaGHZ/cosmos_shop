import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('team launcher configures an existing isolated store and retains tested workflow behavior', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cosmos-team-test-'));
  const config = JSON.parse(fs.readFileSync('team.config.json', 'utf8'));
  fs.writeFileSync(path.join(dir, 'shop.json'), JSON.stringify({ products: [], orders: [{ id: 'LC-SENTINEL' }], tickets: [], events: [], notifications: [], settings: { webhookUrl: 'https://old.example/webhook', marker: 'retain me' } }));
  const child = spawn(process.execPath, ['scripts/team-setup.js', '--start'], { env: { ...process.env, DATA_DIR: dir, PORT: '3110', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Team server startup timed out: ' + errors)), 8000);
      child.stdout.on('data', chunk => { if (chunk.toString().includes('Larkspur demo running')) { clearTimeout(timer); resolve(); } });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Team server exited ${code}: ${errors}`)); });
    });
    const res = await fetch('http://127.0.0.1:3110/api/settings', { headers: { 'x-api-key': config.automationKey } });
    assert.equal(res.status, 200);
    const settings = await res.json();
    assert.equal(settings.webhookUrl, config.n8nBaseUrl + '/webhook/larkspur-order-handling');
    assert.equal(settings.publicBaseUrl, config.shopBaseUrl);
    assert.equal(settings.logisticsWebhookUrl, '');
    assert.equal(settings.supportWebhookUrl, '');
    assert.equal(settings.marker, 'retain me');
    const store = JSON.parse(fs.readFileSync(path.join(dir, 'shop.json'), 'utf8'));
    assert.equal(store.orders[0].id, 'LC-SENTINEL');
    const source = JSON.parse(fs.readFileSync('n8n/final/Cosmos-Ecommerce.tested.json', 'utf8'));
    const generated = JSON.parse(fs.readFileSync('n8n/final/Cosmos-Ecommerce.import.json', 'utf8'));
    assert.equal(generated.nodes.length, 82);
    assert.equal(generated.active, false);
    assert.deepEqual(generated.connections, source.connections);
    assert.deepEqual(generated.nodes.filter(n => n.disabled).map(n => n.name), source.nodes.filter(n => n.disabled).map(n => n.name));
    for (const node of generated.nodes) {
      if (!['OH Configuration', 'OH Followup Configuration', 'OH Sync Lookup Table', 'OH Sync Confirmation State'].includes(node.name) && !node.credentials?.httpHeaderAuth) assert.deepEqual(node, source.nodes.find(n => n.id === node.id));
    }
  } finally {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    // The resolved target is the unique temporary directory created above.
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
