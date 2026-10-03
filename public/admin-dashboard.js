import {esc,money} from './app.js';

const human=value=>esc(String(value||'—').replaceAll('_',' '));
const recent=(a,b)=>new Date(b.createdAt)-new Date(a.createdAt);
const date=value=>value?new Date(value).toLocaleString():'—';
const empty='<p class="empty">No action is waiting right now.</p>';

export function renderOverview(data){
  const orders=data.orders||[],tickets=data.support||[],events=data.events||[],products=data.inventory||[],settings=data.settings||{};
  const review=orders.filter(o=>o.status==='needs_review'||o.reviewReason);
  const warehouse=orders.filter(o=>o.status==='packing'&&o.warehouse?.status!=='ready');
  const delivery=orders.filter(o=>['delayed','exception'].includes(o.shipment?.status));
  const openTickets=tickets.filter(t=>t.status!=='resolved');
  const failed=events.filter(e=>e.delivery?.status==='failed');
  const lowStock=products.filter(p=>p.stock<=5);
  const queue=[
    ...review.map(o=>({title:`Review ${o.id}`,detail:o.reviewReason||o.customer.name,button:`data-order="${esc(o.id)}"`,kind:'Order'})),
    ...openTickets.map(t=>({title:`Reply to ${t.id}`,detail:t.message,button:`data-ticket-open="${esc(t.id)}"`,kind:'Support'})),
    ...delivery.map(o=>({title:`Check delivery for ${o.id}`,detail:human(o.shipment.status),button:`data-order="${esc(o.id)}"`,kind:'Shipping'})),
    ...warehouse.map(o=>({title:`Prepare ${o.id}`,detail:o.warehouse?.taskId||o.customer.name,button:`data-order="${esc(o.id)}"`,kind:'Warehouse'})),
    ...failed.map(e=>({title:`Retry ${e.type}`,detail:e.order_id||e.ticket?.id||'Webhook event',button:`data-jump="events"`,kind:'n8n'}))
  ].slice(0,12);
  const workflow=settings.workflowEditorUrl?`<a class="small-button" href="${esc(settings.workflowEditorUrl)}" target="_blank" rel="noopener noreferrer">Open n8n workflow ↗</a>`:'<span class="muted">Add the workflow editor URL in Connect n8n.</span>';
  const recentOrders=[...orders].sort(recent).slice(0,5);
  return `<section class="dashboard-intro"><div><div class="eyebrow">OPERATIONS DESK</div><h2>One view of the shop.</h2><p class="muted">Order, stock, warehouse, shipment and support records come from the shop. n8n receives events and runs the handoffs.</p></div>${workflow}</section>
    <div class="dashboard-grid">
      <section class="panel dashboard-panel"><div class="section-heading"><h3>Needs attention</h3><span class="pill">${queue.length}</span></div>${queue.length?queue.map(item=>`<div class="work-item"><div><small>${esc(item.kind)}</small><strong>${esc(item.title)}</strong><span>${esc(item.detail)}</span></div><button class="small-button" ${item.button}>Open ↗</button></div>`).join(''):empty}</section>
      <section class="panel dashboard-panel"><h3>Integration check</h3><div class="connection-row"><span>Order webhook</span><b>${settings.webhookUrl?'Connected':'Not configured'}</b></div><div class="connection-row"><span>Logistics webhook</span><b>${settings.logisticsWebhookUrl?'Dedicated':'Shared workflow'}</b></div><div class="connection-row"><span>Support webhook</span><b>${settings.supportWebhookUrl?'Connected':'Uses order webhook'}</b></div><div class="connection-row"><span>Webhook delivery failures</span><b>${failed.length}</b></div><p class="muted">A successful webhook response means n8n accepted the event. Check the workflow’s Executions page for the run result.</p><button class="small-button" data-jump="events">Inspect webhook events ↗</button></section>
      <section class="panel dashboard-panel"><div class="section-heading"><h3>Recent orders</h3><button class="text-button" data-jump="orders">All orders ↗</button></div>${recentOrders.length?recentOrders.map(o=>`<div class="connection-row"><div><b>${esc(o.id)}</b><small>${esc(o.customer.name)} · ${date(o.createdAt)}</small></div><button class="small-button" data-order="${esc(o.id)}">${human(o.status)} ↗</button></div>`).join(''):'<p class="empty">New orders will appear here.</p>'}</section>
      <section class="panel dashboard-panel"><div class="section-heading"><h3>Stock watch</h3><button class="text-button" data-jump="inventory">Inventory ↗</button></div>${lowStock.length?lowStock.map(p=>`<div class="connection-row"><span>${esc(p.name)}</span><b>${p.stock} available</b></div>`).join(''):empty}</section>
    </div>`;
}

export function renderCustomers(data,filter='',selectedEmail=''){
  const customers=(data.crm||[]).filter(c=>`${c.name} ${c.email}`.toLowerCase().includes(filter.toLowerCase()));
  const selected=(data.crm||[]).find(c=>c.email===selectedEmail);
  const orders=selected?(data.orders||[]).filter(o=>o.customer.email.toLowerCase()===selected.email).sort(recent):[];
  const tickets=selected?(data.support||[]).filter(t=>t.email.toLowerCase()===selected.email).sort(recent):[];
  return `<div class="list-tools"><label>Find a customer<input id="crm-search" type="search" value="${esc(filter)}" placeholder="Name or email"></label><p class="muted">Customer records combine shop accounts, orders and support tickets. Spend totals include delivered orders.</p></div>
    <div class="crm-layout"><div class="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>ORDERS</th><th>DELIVERED SPEND</th><th>OPEN TICKETS</th><th>LAST ACTIVITY</th><th></th></tr></thead><tbody>${customers.map(c=>`<tr><td><b>${esc(c.name||'Customer')}</b><small>${esc(c.email)}</small></td><td>${c.orderCount}</td><td>${money(c.totalSpent)}</td><td>${c.openTickets}</td><td>${date(c.lastActivity)}</td><td><button class="small-button" data-customer="${esc(c.email)}">View ↗</button></td></tr>`).join('')}</tbody></table>${customers.length?'':'<p class="empty">No customer records yet. They appear when customers register, place orders or contact support.</p>'}</div>
    ${selected?`<section class="panel crm-detail"><div class="section-heading"><h3>${esc(selected.name||selected.email)}</h3><button class="text-button" data-customer-close="1">Close ×</button></div><p class="muted">${esc(selected.email)} · ${selected.orderCount} orders · ${selected.openTickets} open tickets</p><h4>Orders</h4>${orders.length?orders.map(o=>`<div class="connection-row"><div><b>${esc(o.id)}</b><small>${human(o.status)} · ${money(o.total)}</small></div><button class="small-button" data-order="${esc(o.id)}">Open ↗</button></div>`).join(''):empty}<h4>Support</h4>${tickets.length?tickets.map(t=>`<div class="connection-row"><div><b>${esc(t.id)}</b><small>${human(t.status)} · ${esc(t.message.slice(0,90))}</small></div><button class="small-button" data-ticket-open="${esc(t.id)}">Open ↗</button></div>`).join(''):empty}</section>`:''}</div>`;
}
