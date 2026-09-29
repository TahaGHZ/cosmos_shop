import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {initializeUsers,currentUser,login,logout,register,safeUser} from './auth.js';
import {workflowOrder,lookupOrder} from './integration.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'shop.json');
const catalog = [
  ['ceramic-vase', 'The everyday vase', 'Living', 38, 18, 'Clay, quietly expressive.', '#c29a7f', 'vase'],
  ['table-lamp', 'A little evening light', 'Living', 89, 8, 'A warmer corner of the world.', '#dab990', 'lamp'],
  ['linen-throw', 'Sunday linen throw', 'Textiles', 64, 12, 'For doing absolutely nothing.', '#9caa91', 'throw'],
  ['coffee-set', 'Slow morning cups', 'Kitchen', 32, 24, 'A pair for your daily ritual.', '#dccbb2', 'cups'],
  ['oak-stool', 'The nook stool', 'Furniture', 115, 4, 'Small footprint. Big character.', '#b68f62', 'stool'],
  ['serving-bowl', 'Gather serving bowl', 'Kitchen', 46, 0, 'Good things belong together.', '#8f9b7e', 'bowl'],
  ['linen-cushion', 'Soft landing cushion', 'Textiles', 29, 16, 'An invitation to stay a little.', '#bb8f73', 'cushion'],
  ['wood-board', 'Kitchen companion board', 'Kitchen', 42, 10, 'Made for sharing.', '#b58d61', 'board'],
].map(([id,name,category,price,stock,description,color,shape]) => ({id,name,category,price,stock,description,color,shape}));
const seed = () => ({ products: structuredClone(catalog), orders: [], tickets: [], events: [], notifications: [], settings: { webhookUrl: process.env.N8N_WEBHOOK_URL || '', publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${port}` } });
let db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : seed();
initializeUsers(db);
db.settings.automationKey=process.env.API_KEY||db.settings.automationKey||randomUUID();
db.settings.logisticsWebhookUrl??='';
db.settings.supportWebhookUrl??='';
const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
save();
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const findOrder = id => db.orders.find(o => o.id === id) || fail('Order not found', 404);
const history = (o, message) => o.history.push({ at: new Date().toISOString(), status: o.status, message });
const notify = (o, message) => db.notifications.unshift({id:randomUUID(), orderId:o.id, email:o.customer.email, message, at:new Date().toISOString(), simulated:true});
function event(type, order, extra = {}) {
  const webhookUrl=type==='order.confirmed'&&db.settings.logisticsWebhookUrl?db.settings.logisticsWebhookUrl:type==='support.created'&&db.settings.supportWebhookUrl?db.settings.supportWebhookUrl:db.settings.webhookUrl;
  const e = { id:randomUUID(), type, createdAt:new Date().toISOString(), baseUrl:db.settings.publicBaseUrl, logisticsManaged:!!db.settings.logisticsWebhookUrl, order_id:order?.id||null, order:order?workflowOrder(structuredClone(order),db.settings.publicBaseUrl):null, ...extra, delivery:{status:webhookUrl ? 'pending' : 'not_configured', attempts:0,webhookUrl} };
  db.events.unshift(e); save();
  if (webhookUrl) setImmediate(() => deliver(e));
  return e;
}
async function deliver(e) {
  const webhookUrl=e.type==='order.confirmed'&&db.settings.logisticsWebhookUrl?db.settings.logisticsWebhookUrl:e.type==='support.created'&&db.settings.supportWebhookUrl?db.settings.supportWebhookUrl:db.settings.webhookUrl;
  if (!webhookUrl) fail('Set the corresponding n8n webhook URL first');
  e.delivery.webhookUrl=webhookUrl;
  e.delivery.attempts++; e.delivery.status='pending'; save();
  try {
    const {delivery, ...payload} = e;
    const response = await fetch(webhookUrl, {method:'POST', headers:{'content-type':'application/json', ...(process.env.WEBHOOK_SECRET ? {'x-webhook-secret':process.env.WEBHOOK_SECRET} : {})}, body:JSON.stringify(payload), signal:AbortSignal.timeout(10000)});
    e.delivery.status = response.ok ? 'delivered' : 'failed'; e.delivery.httpStatus=response.status;
    e.delivery.detail=(await response.text()).slice(0,300);
  } catch(error) { e.delivery.status='failed'; e.delivery.detail=error.message; }
  e.delivery.lastAttemptAt=new Date().toISOString(); save();
}
function action(o, name, b) {
  if (name === 'validate') {
    if (o.status !== 'received') return o;
    if (o.payment.status !== 'authorized') { o.status='needs_review'; history(o,'Payment needs human review'); event('order.review_required',o); return o; }
    o.status='awaiting_confirmation'; history(o,'Order validated; waiting for customer confirmation'); notify(o,`Confirm your order: ${db.settings.publicBaseUrl}/?order=${o.id}&token=${o.confirmationToken}`); event('order.validated',o);
  } else if (name === 'remind') {
    if(o.status!=='awaiting_confirmation') fail('Only orders waiting for confirmation can be reminded',409);
    if(o.lastReminderAt&&Date.now()-Date.parse(o.lastReminderAt)<86400000) return o;
    o.lastReminderAt=new Date().toISOString();o.reminderCount=(o.reminderCount||0)+1;
    notify(o,`Reminder: confirm your order ${db.settings.publicBaseUrl}/?order=${o.id}&token=${o.confirmationToken}`);
    history(o,'Confirmation reminder recorded in demo outbox');event('order.reminder',o);
  } else if (name === 'confirm') {
    if (o.confirmation === 'confirmed') return o;
    if (o.status !== 'awaiting_confirmation') fail('Validate the order before confirming it',409);
    o.confirmation='confirmed'; o.status='confirmed'; history(o,'Customer confirmed the order'); event('order.confirmed',o);
  } else if (name === 'reserve') {
    if (o.inventoryReserved) return o;
    if (o.status !== 'confirmed' || o.payment.status !== 'authorized') fail('Order must be confirmed with an authorized payment',409);
    const unavailable=o.items.filter(i => db.products.find(p=>p.id===i.productId).stock < i.quantity);
    if (unavailable.length) { o.status='needs_review'; history(o,'Insufficient stock; no inventory deducted'); event('order.review_required',o,{reason:'insufficient_stock'}); return o; }
    for(const i of o.items) db.products.find(p=>p.id===i.productId).stock-=i.quantity;
    o.inventoryReserved=true; o.status='packing'; o.warehouse={status:'in_progress', taskId:`WH-${o.id}`, checklist:{picked:false,verified:false,packed:false}};
    history(o,'Inventory reserved; warehouse task created'); event('inventory.reserved',o);
  } else if (name === 'warehouse') {
    if(o.status !== 'packing') fail('Only packing orders have an active warehouse task',409);
    if(!['in_progress','ready','issue'].includes(b.status)) fail('Invalid warehouse status');
    const checklist=b.checklist || o.warehouse.checklist;
    if(b.status==='ready' && !['picked','verified','packed'].every(k=>checklist[k]===true)) fail('Pick, verify, and pack the order before marking it ready');
    o.warehouse={...o.warehouse,status:b.status,checklist}; history(o,`Warehouse: ${b.status}`); event(b.status==='ready'?'warehouse.ready':'warehouse.updated',o);
  } else if (name === 'ship') {
    if(o.shipment) return o;
    if(o.status !== 'packing' || o.warehouse.status !== 'ready') fail('Warehouse must mark the order ready first',409);
    o.shipment={id:`SHIP-${o.id}`,trackingNumber:`DEMO-${randomUUID().slice(0,8).toUpperCase()}`,carrier:'Larkspur Demo Courier',status:'in_transit',createdAt:new Date().toISOString(),estimatedDelivery:new Date(Date.now()+(o.shippingMethod==='express'?3:7)*86400000).toISOString()}; o.status='shipped'; history(o,'Handed to demo courier'); notify(o,`Your order has shipped. Tracking: ${o.shipment.trackingNumber}`); event('order.shipped',o);
  } else if (name === 'delivery') {
    if(!o.shipment || !['shipped','delivered'].includes(o.status)) fail('Order has not shipped',409);
    if(!['in_transit','delayed','delivered','exception'].includes(b.status)) fail('Invalid delivery status');
    if(o.shipment.status==='delivered' && b.status!=='delivered') fail('Delivered shipments cannot move backwards',409);
    if(o.shipment.status===b.status) return o;
    o.shipment.status=b.status; if(b.status==='delivered') {o.status='delivered'; o.deliveredAt=new Date().toISOString();}
    history(o,`Delivery: ${b.status}`); notify(o,`Delivery update: ${b.status.replaceAll('_',' ')}`); event('shipment.updated',o);
  } else if (name === 'reconcile') {
    if(o.status!=='delivered') fail('Reconcile payment after delivery',409);
    if(o.payment.status==='settled') return o;
    o.payment.status='settled'; history(o,'Demo payment reconciled'); event('payment.reconciled',o);
  } else if (name === 'cancel') {
    if(o.status==='cancelled') return o;
    if(['shipped','delivered'].includes(o.status)) fail('Shipped orders cannot be cancelled',409);
    if(o.inventoryReserved) { for(const i of o.items) db.products.find(p=>p.id===i.productId).stock+=i.quantity; o.inventoryReserved=false; }
    o.status='cancelled'; o.payment.status=o.payment.status==='authorized'?'refunded':o.payment.status; history(o,'Order cancelled; reserved stock released'); notify(o,'Your order has been cancelled. Any authorized demo payment has been refunded.'); event('order.cancelled',o);
  } else fail('Unknown order action',404);
  save(); return o;
}
const publicOrder = o => {const {confirmationToken,idempotencyKey,...rest}=o; return rest;};
async function route(req,res) {
  const url=new URL(req.url,'http://localhost'); const pathname=url.pathname;
  const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
  if(pathname.startsWith('/api/')) {
    res.setHeader('Cache-Control','no-store');
    let b={}; if(['POST','PATCH'].includes(req.method)) {let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000) fail('Request too large',413);} try {b=raw?JSON.parse(raw):{};}catch{fail('Invalid JSON');}}
    if(!b||typeof b!=='object'||Array.isArray(b)) fail('JSON object required');
    const user=currentUser(req,db);
    const supplied=Buffer.from(req.headers['x-api-key']||''),expected=Buffer.from(db.settings.automationKey);
    const automation=supplied.length===expected.length&&timingSafeEqual(supplied,expected);
    const privileged=automation||user?.role==='admin';
    if(req.headers.origin&&req.method!=='GET'&&!automation&&new URL(req.headers.origin).host!==req.headers.host) fail('Cross-origin writes are not allowed',403);
    if(pathname==='/api/auth/me'&&req.method==='GET')return json({user:safeUser(user)});
    if(pathname==='/api/auth/login'&&req.method==='POST'){const u=login(b.email,b.password,db,res);if(!u)fail('Incorrect email or password',401);return json({user:u});}
    if(pathname==='/api/auth/register'&&req.method==='POST'){const result=register(b,db);if(result.error)fail(result.error);save();login(b.email,b.password,db,res);return json(result,201);}
    if(pathname==='/api/auth/logout'&&req.method==='POST'){logout(req,res);return json({ok:true});}
    const isPublic=req.method==='GET'&&['/api/products','/api/policies','/api/health'].includes(pathname);
    const tokenOrder=url.searchParams.get('token')||b.token;
    const own=(o)=>privileged||user&&o.customer.email.toLowerCase()===user.email||tokenOrder&&tokenOrder===o.confirmationToken;
    const customerRoute=pathname==='/api/orders'||/^\/api\/orders\/[^/]+(?:\/(confirm|cancel))?$/.test(pathname)||pathname==='/api/support';
    if(!isPublic&&!privileged&&!user&&!tokenOrder)fail('Please sign in',401);
    if(!isPublic&&!privileged&&!customerRoute)fail('Admin access required',403);
    if(pathname.startsWith('/api/automation/')&&!automation)fail('Automation API key required',401);
    if(req.method==='GET' && pathname==='/api/products') return json(db.products);
    if(req.method==='GET' && pathname==='/api/health') return json({ok:true,demo:true});
    if(req.method==='GET' && pathname==='/api/policies') {const policyPath=path.join(root,'reference_docs','ecommerce_customer_support_kb (1).md');res.writeHead(200,{'content-type':'text/markdown; charset=utf-8'});return res.end(fs.readFileSync(policyPath));}
    if(pathname==='/api/automation/order-lookup'&&req.method==='POST'){if(!b.order_id||!b.customer_email)fail('order_id and customer_email are required');const o=db.orders.find(o=>o.id===String(b.order_id)&&o.customer.email.toLowerCase()===String(b.customer_email).trim().toLowerCase());return json(o?lookupOrder(o):{found:false,message:'No matching order for this customer'});}
    const auto=pathname.match(/^\/api\/automation\/orders\/([^/]+)(?:\/([^/]+))?$/);
    if(auto){const o=findOrder(auto[1]);if(req.method==='GET'&&!auto[2])return json(workflowOrder(o,db.settings.publicBaseUrl));
      if(req.method==='GET'&&auto[2]==='stock'){const stockLines=o.items.map(i=>{const p=db.products.find(p=>p.id===i.productId);return {sku:i.productId,name:i.name,requested:i.quantity,available:p.stock,sufficient:o.inventoryReserved||p.stock>=i.quantity};});return json({order_id:o.id,stockAvailable:stockLines.every(i=>i.sufficient),stockErrors:stockLines.filter(i=>!i.sufficient).map(i=>`Insufficient stock: ${i.sku}`),stockLines});}
      if(req.method==='GET'&&auto[2]==='warehouse')return json({order_id:o.id,warehouse_task_id:o.warehouse?.taskId,warehouse_status:o.warehouse?.status==='in_progress'?'packaging':o.warehouse?.status==='issue'?'physical_discrepancy':o.warehouse?.status||'pending'});
      if(req.method==='GET'&&auto[2]==='shipment'){if(!o.shipment)fail('Shipment not created',409);return json({order_id:o.id,shipment_id:o.shipment.id,tracking_number:o.shipment.trackingNumber,carrier:o.shipment.carrier,status:o.shipment.status,tracking_url:`${db.settings.publicBaseUrl}/?order=${o.id}`,estimated_delivery:o.shipment.estimatedDelivery});}
      if(req.method==='POST'&&auto[2]==='reconcile'){if(o.status!=='delivered')fail('Order must be delivered',409);const paid=o.payment.amount??o.total;const reconciled=['authorized','settled'].includes(o.payment.status)&&Math.abs(paid-o.total)<.01&&o.currency==='EUR';if(reconciled)action(o,'reconcile',{});return json({order_id:o.id,total_amount:o.total,paid_amount:paid,currency:o.currency,payment_status:reconciled?'paid':o.payment.status,reconciled,discrepancyReason:reconciled?null:'Payment does not match the order'});}
      if(req.method==='POST'&&auto[2]==='escalate'){o.reviewReason=String(b.reason||'Workflow requested human review');history(o,o.reviewReason);save();return json({ok:true,order_id:o.id});}
      if(req.method==='POST'&&auto[2]==='handoff-record'){if(o.status!=='confirmed')fail('Only confirmed orders can be handed off',409);if(!o.logisticsHandoff)o.logisticsHandoff={acceptedAt:new Date().toISOString(),eventId:b.eventId||null};save();return json({ok:true,order_id:o.id,handoff:o.logisticsHandoff});}
      if(req.method==='POST'&&auto[2])return json(workflowOrder(action(o,auto[2],b),db.settings.publicBaseUrl));
    }
    if(pathname==='/api/orders' && req.method==='GET') {if(!privileged&&!user)fail('Please sign in',401);return json(db.orders.filter(o=>(privileged||o.customer.email.toLowerCase()===user.email)&&(!url.searchParams.get('email')||o.customer.email.toLowerCase()===url.searchParams.get('email').toLowerCase())).map(publicOrder));}
    if(pathname==='/api/orders' && req.method==='POST') {
      if(!privileged&&!user)fail('Please sign in to place an order',401);
      if(!privileged)b.customer={...b.customer,name:user.name,email:user.email};
      const key=req.headers['idempotency-key'] || b.idempotencyKey;
      if(key && db.orders.some(o=>o.idempotencyKey===key)) {const previous=db.orders.find(o=>o.idempotencyKey===key);if(!own(previous))fail('Idempotency key belongs to another customer',409);return json(publicOrder(previous),200);}
      if(!b.customer?.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.customer?.email||'') || !b.customer?.address?.trim()) fail('Name, valid email, and shipping address are required');
      if(!Array.isArray(b.items) || !b.items.length || b.items.length>50) fail('An order needs 1–50 items');
      const merged=new Map();
      for(const i of b.items){const p=db.products.find(p=>p.id===i.productId);if(!p || !Number.isInteger(i.quantity) || i.quantity<1 || i.quantity>99) fail('Invalid product or quantity');merged.set(p.id,(merged.get(p.id)||0)+i.quantity);}
      const items=[...merged].map(([productId,quantity])=>{if(quantity>99) fail('Maximum 99 units per product');const p=db.products.find(p=>p.id===productId);return {productId,name:p.name,quantity,unitPrice:p.price};});
      if(!['authorized','failed','pending'].includes(b.paymentStatus||'authorized')) fail('Invalid demo payment status');
      if(!['standard','express'].includes(b.shippingMethod||'standard')) fail('Invalid shipping method');
      const subtotal=items.reduce((s,i)=>s+i.quantity*i.unitPrice,0), shipping=b.shippingMethod==='express'?12:subtotal>=100?0:6;
      const o={id:`LC-${String(db.orders.length+1001)}`,createdAt:new Date().toISOString(),customer:{name:b.customer.name.trim(),email:b.customer.email.trim(),address:b.customer.address.trim()},items,subtotal,shipping,total:subtotal+shipping,currency:'EUR',shippingMethod:b.shippingMethod||'standard',status:'received',confirmation:'pending',confirmationToken:randomUUID(),payment:{status:b.paymentStatus||'authorized',method:'demo_card',transactionId:`PAY-${randomUUID().slice(0,8)}`},inventoryReserved:false,warehouse:null,shipment:null,history:[],idempotencyKey:key||null};
      o.shippingAddress={street:String(b.shippingAddress?.street||b.customer.address),city:String(b.shippingAddress?.city||''),postal_code:String(b.shippingAddress?.postal_code||''),country:String(b.shippingAddress?.country||'')};o.payment.amount=o.payment.status==='authorized'?o.total:0;
      history(o,'Order received'); db.orders.unshift(o); event('order.created',o); return json(publicOrder(o),201);
    }
    const m=pathname.match(/^\/api\/orders\/([^/]+)(?:\/([^/]+))?$/);
    if(m){const o=findOrder(m[1]);if(!own(o))fail('Order not found',404);if(req.method==='GET' && !m[2]) return json(publicOrder(o));
      if(req.method==='POST' && m[2]) {if(!privileged&&!['confirm','cancel'].includes(m[2]))fail('Admin access required',403);if(m[2]==='confirm' && b.token && b.token!==o.confirmationToken) fail('Invalid confirmation link',403);return json(publicOrder(action(o,m[2],b)));}}
    if(pathname==='/api/inventory' && req.method==='GET') return json(db.products);
    const p=pathname.match(/^\/api\/inventory\/([^/]+)$/);
    if(p && req.method==='PATCH'){const product=db.products.find(i=>i.id===p[1])||fail('Product not found',404);if(!Number.isInteger(b.stock)||b.stock<0) fail('Stock must be a nonnegative integer');product.stock=b.stock;save();return json(product);}
    if(pathname==='/api/support' && req.method==='GET') {if(!privileged&&!user)fail('Please sign in',401);return json(db.tickets.filter(t=>privileged||t.email===user.email));}
    if(pathname==='/api/support' && req.method==='POST') {if(!privileged&&!user)fail('Please sign in to contact support',401);if(!privileged)b.email=user.email;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email||'') || !b.message?.trim()) fail('Email and message are required');if(b.orderId&&!own(findOrder(b.orderId)))fail('Order not found',404);const ticket={id:`T-${db.tickets.length+101}`,email:b.email,orderId:b.orderId||null,message:b.message.trim(),status:'open',createdAt:new Date().toISOString(),replies:[]};db.tickets.unshift(ticket);event('support.created',null,{ticket});return json(ticket,201);}
    const reply=pathname.match(/^\/api\/support\/([^/]+)\/replies$/);
    if(reply&&req.method==='POST'){const ticket=db.tickets.find(t=>t.id===reply[1])||fail('Ticket not found',404);if(typeof b.message!=='string'||!b.message.trim())fail('Reply message required');ticket.replies??=[];ticket.replies.push({message:b.message.trim(),at:new Date().toISOString(),source:automation?'n8n':'admin'});ticket.reply=b.message.trim();if(b.status){if(!['open','escalated','resolved'].includes(b.status))fail('Invalid ticket status');ticket.status=b.status;}save();return json(ticket);}
    const t=pathname.match(/^\/api\/support\/([^/]+)$/);
    if(t && req.method==='PATCH') {const ticket=db.tickets.find(i=>i.id===t[1])||fail('Ticket not found',404);if(!['open','escalated','resolved'].includes(b.status)) fail('Invalid ticket status');ticket.status=b.status;if(b.reply) ticket.reply=String(b.reply);save();return json(ticket);}
    if(req.method==='GET' && ['/api/events','/api/notifications','/api/settings'].includes(pathname)) return json(db[pathname.slice(5)]);
    if(pathname==='/api/settings' && req.method==='PATCH'){for(const k of ['webhookUrl','logisticsWebhookUrl','supportWebhookUrl','publicBaseUrl'])if(b[k]!==undefined){if(b[k] || k==='publicBaseUrl'){let u;try{u=new URL(b[k]);}catch{fail('Invalid URL');}if(!['http:','https:'].includes(u.protocol))fail('Use an HTTP or HTTPS URL');}db.settings[k]=b[k].replace(/\/$/,'');}save();return json(db.settings);}
    const e=pathname.match(/^\/api\/events\/([^/]+)\/retry$/);
    if(e && req.method==='POST'){const evt=db.events.find(i=>i.id===e[1])||fail('Event not found',404);await deliver(evt);return json(evt);}
    return json({error:'Endpoint not found'},404);
  }
  if(!['GET','HEAD'].includes(req.method)) return json({error:'Method not allowed'},405);
  const file=pathname==='/'?'index.html':pathname==='/admin'?'admin.html':['/login','/account'].includes(pathname)?pathname.slice(1)+'.html':pathname==='/favicon.ico'?'favicon.svg':decodeURIComponent(pathname.slice(1));
  const target=path.resolve(root,'public',file); if(!target.startsWith(path.join(root,'public')+path.sep)) return json({error:'Not found'},404);
  if(!fs.existsSync(target)||!fs.statSync(target).isFile()) return json({error:'Not found'},404);
  const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
  res.writeHead(200,{'content-type':`${types[path.extname(target)]||'application/octet-stream'}; charset=utf-8`});res.end(req.method==='HEAD'?undefined:fs.readFileSync(target));
}
const server=http.createServer((req,res)=>route(req,res).catch(error=>{if(!res.headersSent){res.writeHead(error.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.status?error.message:'Unexpected server error'}));}console.error(error.message);}));
server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Larkspur demo running at http://localhost:${port}`));
