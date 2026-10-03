import {api,esc,money,toast} from './app.js';
import {connectionPanel} from './connection.js';
import {renderOverview,renderCustomers} from './admin-dashboard.js';

const $=s=>document.querySelector(s);
let tab='dashboard',data={},selected=null,selectedCustomer='',crmFilter='';
const label=s=>esc(s?.replaceAll('_',' ')||'—');
const byRecent=(a,b)=>new Date(b.createdAt)-new Date(a.createdAt);
const openOrder=async id=>{await workspace(id);$('#order-dialog').showModal();};

function renderStats(){
 const orders=data.orders||[];
 const cards=[
  [orders.length,'Orders placed'],
  [orders.filter(o=>o.status==='awaiting_confirmation').length,'Awaiting confirmation'],
  [orders.filter(o=>o.status==='packing').length,'In the warehouse'],
  [orders.filter(o=>o.status==='needs_review').length,'Needs human review'],
  [orders.filter(o=>['in_transit','delayed'].includes(o.shipment?.status)).length,'In delivery'],
  [orders.filter(o=>o.status==='delivered').length,'Delivered'],
  [data.support.filter(t=>t.status!=='resolved').length,'Open support tickets'],
  [data.events.filter(e=>e.delivery.status==='failed').length,'Failed webhook deliveries'],
 ];
 $('#stats').innerHTML=cards.map(([count,name])=>`<div class="stat"><strong>${count}</strong><span>${name}</span></div>`).join('');
}

function render(){
 const c=$('#content');
 if(tab==='dashboard')c.innerHTML=renderOverview(data);
 if(tab==='customers')c.innerHTML=renderCustomers(data,crmFilter,selectedCustomer);
 if(tab==='orders'){
  const options=['all','received','awaiting_confirmation','confirmed','packing','shipped','delivered','needs_review','cancelled'];
  c.innerHTML=`<div class="list-tools"><label>Find an order<input id="order-search" type="search" placeholder="Order ID, customer or email"></label><label>Order status<select id="order-status">${options.map(s=>`<option value="${s}">${s==='all'?'All statuses':label(s)}</option>`).join('')}</select></label></div><div id="orders-table"></div>`;
  renderOrderTable();
 }
 if(tab==='warehouse'){
  const rows=data.orders.filter(o=>o.warehouse).sort(byRecent);
  c.innerHTML=`<p class="muted">Pick, verify and pack orders here. Marking a task ready lets the n8n logistics run create a demo shipment.</p>${rows.length?`<div class="table-scroll"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>WAREHOUSE TASK</th><th>CHECKLIST</th><th>ORDER</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(o.id)}<small>${new Date(o.createdAt).toLocaleString()}</small></td><td>${esc(o.customer.name)}<small>${esc(o.customer.email)}</small></td><td><span class="pill">${label(o.warehouse.status)}</span><small>${esc(o.warehouse.taskId||'')}</small></td><td>${['picked','verified','packed'].map(k=>`${o.warehouse.checklist?.[k]?'✓':'○'} ${k}`).join(' · ')}</td><td><button class="small-button" data-order="${esc(o.id)}">Open task ↗</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">Warehouse tasks appear after stock is reserved for a confirmed order.</p>'}`;
 }
 if(tab==='shipping'){
  const rows=data.orders.filter(o=>o.shipment).sort(byRecent);
  c.innerHTML=`<p class="muted">Demo tracking and delivery updates live here. Change an order in its workspace; n8n reads the saved state. No carrier is connected.</p>${rows.length?`<div class="table-scroll"><table><thead><tr><th>ORDER</th><th>TRACKING</th><th>CARRIER</th><th>DELIVERY STATUS</th><th>PAYMENT</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(o.id)}<small>${esc(o.customer.name)}</small></td><td>${esc(o.shipment.trackingNumber||'Pending')}<small>${o.shipment.estimatedDelivery?`ETA ${esc(new Date(o.shipment.estimatedDelivery).toLocaleDateString())}`:''}</small></td><td>${esc(o.shipment.carrier||'Demo')}</td><td><span class="pill">${label(o.shipment.status)}</span></td><td>${label(o.payment.status)}</td><td><button class="small-button" data-order="${esc(o.id)}">Track order ↗</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No demo shipments yet. Mark a warehouse task ready to create one.</p>'}`;
 }
 if(tab==='inventory') c.innerHTML=`<p class="muted">Available stock is deducted when a confirmed order is reserved. Cancellation releases it.</p><div class="table-scroll"><table><thead><tr><th>PRODUCT</th><th>PRICE</th><th>AVAILABLE STOCK</th><th></th></tr></thead><tbody>${data.inventory.map(p=>`<tr><td>${esc(p.name)}<small>${esc(p.id)}</small></td><td>${money(p.price)}</td><td><input type="number" min="0" step="1" value="${p.stock}" id="stock-${esc(p.id)}" aria-label="Stock for ${esc(p.name)}" style="width:100px"></td><td><button class="small-button" data-stock="${esc(p.id)}">Update stock</button></td></tr>`).join('')}</tbody></table></div>`;
 if(tab==='support')c.innerHTML=data.support.length?data.support.map(t=>`<article class="panel" id="ticket-${esc(t.id)}"><h3>${esc(t.id)} <span class="pill">${label(t.status)}</span></h3><p class="muted">${esc(t.email)} · ${esc(t.orderId||'No order reference')} · Thread ${esc(t.threadId||t.id)}</p><div class="support-thread">${(t.messages||[{role:'customer',content:t.message,at:t.createdAt}]).map(m=>`<div class="thread-message ${m.role==='customer'?'from-customer':'from-staff'}"><b>${esc(m.role==='customer'?'Customer':m.role==='automation'?'Automation':'Staff')}</b><p>${esc(m.content||m.message)}</p><small>${new Date(m.at).toLocaleString()}</small></div>`).join('')}</div>${t.triage?`<p><b>${label(t.triage.category)} · ${label(t.triage.priority)} priority</b><br>${esc(t.triage.orderContext)}</p><p class="muted">Reconstructed ${t.triage.messageCount||1} messages. ${esc(t.triage.threadSummary||'')}<br>Suggested draft: ${esc(t.triage.suggestedReply)}</p>`:''}<label>Staff reply<textarea id="reply-${esc(t.id)}" placeholder="Reply is added to the saved thread"></textarea></label><div class="actions"><button class="small-button" data-ticket="${esc(t.id)}" data-status="escalated">Escalate to human</button><button class="small-button" data-ticket="${esc(t.id)}" data-status="resolved">Save reply & resolve</button></div></article>`).join(''):'<p class="empty">No messages yet. Use “Need a hand?” in the shop.</p>';
 if(tab==='notifications')c.innerHTML=`<p class="muted">These are simulated messages and support drafts stored locally. No emails are sent.</p>`+(data.notifications.length?data.notifications.map(n=>`<article class="panel"><h3>${esc(n.ticketId||n.orderId||'Demo draft')}</h3><p>${esc(n.message)}</p><small>${esc(n.email)} · ${new Date(n.at).toLocaleString()}${n.draft?' · Staff review required':''}</small></article>`).join(''):'<p class="empty">Validation, shipment, delivery, and support drafts will appear here.</p>');
 if(tab==='events')c.innerHTML=`<p class="muted">Delivery status records the webhook HTTP response, not the outcome of the n8n workflow. Retries keep the same event ID.</p>`+(data.events.length?data.events.map(e=>`<div class="event-row"><div><b>${esc(e.type)}</b><small>${esc(e.order?.id||e.ticket?.id||'')} · ${new Date(e.createdAt).toLocaleString()} · ${e.delivery.attempts} attempts</small>${e.delivery.detail?`<small>${esc(e.delivery.detail)}</small>`:''}<details><summary class="muted">View payload</summary><pre>${esc(JSON.stringify(e,null,2))}</pre></details></div><span class="pill">${label(e.delivery.status)}</span><button class="small-button" data-retry="${esc(e.id)}">Replay ↗</button></div>`).join(''):'<p class="empty">Place an order to create your first event.</p>');
 if(tab==='settings')c.innerHTML=connectionPanel(data.settings);
}

function renderOrderTable(){
 const search=$('#order-search')?.value.trim().toLowerCase()||'';
 const status=$('#order-status')?.value||'all';
 const orders=[...data.orders].sort(byRecent).filter(o=>{
  const matchesStatus=status==='all'||o.status===status;
  const text=[o.id,o.customer.name,o.customer.email].join(' ').toLowerCase();
  return matchesStatus&&text.includes(search);
 });
 $('#orders-table').innerHTML=orders.length?`<div class="table-scroll"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>TOTAL</th><th>STATUS</th><th>PAYMENT</th><th></th></tr></thead><tbody>${orders.map(o=>`<tr><td>${esc(o.id)}<small>${new Date(o.createdAt).toLocaleString()}</small></td><td>${esc(o.customer.name)}<small>${esc(o.customer.email)}</small></td><td>${money(o.total)}</td><td><span class="pill">${label(o.status)}</span></td><td>${label(o.payment.status)}</td><td><button class="small-button" data-order="${esc(o.id)}">Open order ↗</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No orders match these filters.</p>';
}

async function workspace(id){
 selected=id;
 const o=await api('/orders/'+encodeURIComponent(id));
 const deliveryOptions=['in_transit','delayed','delivered','exception'];
 $('#order-workspace').innerHTML=`<h3>${esc(o.id)} <span class="pill">${label(o.status)}</span></h3><p>${esc(o.customer.name)} · ${esc(o.customer.email)}<br>${esc(o.customer.address)}</p><p>${o.items.map(i=>`${i.quantity} × ${esc(i.name)} · ${money(i.quantity*i.unitPrice)}`).join('<br>')}<br><b>Total ${money(o.total)}</b> · Payment ${label(o.payment.status)}</p><div class="actions">${o.status==='received'?'<button class="primary" data-action="validate">Validate order</button>':''}${o.status==='awaiting_confirmation'?'<button class="primary" data-action="confirm">Simulate customer confirmation</button>':''}${o.status==='confirmed'?'<button class="primary" data-action="reserve">Reserve stock & create task</button>':''}${!['shipped','delivered','cancelled'].includes(o.status)?'<button class="small-button" data-action="cancel">Cancel order</button>':''}</div>${o.warehouse?`<div class="panel"><h3>Warehouse · ${label(o.warehouse.status)}</h3><p class="muted">Complete each physical check, then mark the task ready for the logistics workflow.</p><div class="checks">${['picked','verified','packed'].map(k=>`<label><input type="checkbox" id="check-${k}" ${o.warehouse.checklist[k]?'checked':''}>${k}</label>`).join('')}</div>${o.status==='packing'?'<div class="actions"><button class="small-button" data-action="warehouse" data-status="in_progress">Save progress</button><button class="primary" data-action="warehouse" data-status="ready">Mark ready</button><button class="small-button" data-action="warehouse" data-status="issue">Report issue</button></div>':''}${o.status==='packing'&&o.warehouse.status==='ready'?'<button class="primary" data-action="ship">Create demo shipment</button>':''}</div>`:''}${o.shipment?`<div class="panel"><h3>Shipment · ${label(o.shipment.status)}</h3><p><b>${esc(o.shipment.trackingNumber||'Tracking pending')}</b><br>${esc(o.shipment.carrier||'Demo courier')} · ${esc(o.shipment.estimatedDelivery||'')}</p><label>Demo delivery update<select id="delivery-status">${deliveryOptions.map(s=>`<option value="${s}" ${o.shipment.status===s?'selected':''}>${label(s)}</option>`).join('')}</select></label><button class="small-button" data-action="delivery">Save delivery update</button>${o.status==='delivered'&&o.payment.status!=='settled'?'<div class="actions"><button class="primary" data-action="reconcile">Reconcile demo payment</button></div>':''}</div>`:''}${o.status==='needs_review'?'<p class="error">This order needs human review. Inspect its history; cancel and place a corrected demo order when ready.</p>':''}<h3>Order history</h3><ol class="timeline">${o.history.map(h=>`<li>${esc(h.message)}<small>${new Date(h.at).toLocaleString()}</small></li>`).join('')}</ol>`;
}

async function refresh(){
 try{
  const names=['orders','inventory','support','notifications','events','settings','crm'];
  const values=await Promise.all(names.map(n=>api('/'+n)));
  data=Object.fromEntries(names.map((n,i)=>[n,values[i]]));
  renderStats();render();
  if(selected&&$('#order-dialog').open)await workspace(selected);
 }catch(e){$('#content').innerHTML='<p class="error">'+esc(e.message)+'</p>';toast(e.message);}
}

document.addEventListener('input',e=>{if(e.target.id==='order-search')renderOrderTable();if(e.target.id==='crm-search'){crmFilter=e.target.value;const start=e.target.selectionStart;render();$('#crm-search').focus();$('#crm-search').setSelectionRange(start,start);}});
document.addEventListener('change',e=>{if(e.target.id==='order-status')renderOrderTable();});
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 try{
  if(b.dataset.tab){tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));render();}
  if(b.dataset.jump){tab=b.dataset.jump;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));render();}
  if(b.dataset.customer){selectedCustomer=b.dataset.customer;render();}
  if(b.dataset.customerClose){selectedCustomer='';render();}
  if(b.dataset.ticketOpen){tab='support';document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));render();document.getElementById('ticket-'+b.dataset.ticketOpen)?.scrollIntoView({block:'center'});}
  if(b.id==='refresh')await refresh();
  if(b.id==='close-dialog')$('#order-dialog').close();
  if(b.dataset.order)await openOrder(b.dataset.order);
  if(b.dataset.action){
   b.disabled=true;let body={};
   if(b.dataset.action==='warehouse')body={status:b.dataset.status,checklist:Object.fromEntries(['picked','verified','packed'].map(k=>[k,$('#check-'+k).checked]))};
   if(b.dataset.action==='delivery')body={status:$('#delivery-status').value};
   await api(`/orders/${encodeURIComponent(selected)}/${b.dataset.action}`,'POST',body);
   await refresh();toast('Order updated.');
  }
  if(b.dataset.stock){await api('/inventory/'+encodeURIComponent(b.dataset.stock),'PATCH',{stock:Number($('#stock-'+CSS.escape(b.dataset.stock)).value)});toast('Stock updated.');await refresh();}
  if(b.dataset.retry){b.disabled=true;await api(`/events/${encodeURIComponent(b.dataset.retry)}/retry`,'POST',{});await refresh();toast('Event replay finished.');}
  if(b.dataset.ticket){await api('/support/'+encodeURIComponent(b.dataset.ticket),'PATCH',{status:b.dataset.status,reply:$('#reply-'+CSS.escape(b.dataset.ticket)).value});await refresh();toast('Ticket updated.');}
 }catch(err){toast(err.message);}finally{b.disabled=false;}
});

document.addEventListener('submit',async e=>{if(e.target.id==='settings-form'){e.preventDefault();try{await api('/settings','PATCH',Object.fromEntries(new FormData(e.target)));await refresh();toast('Connection saved.');}catch(err){toast(err.message);}}});
$('#order-dialog').addEventListener('close',()=>selected=null);
const {user}=await api('/auth/me');
if(!user)location.replace('/login?next=/admin');
else if(user.role!=='admin')location.replace('/account');
else{document.querySelector('header').insertAdjacentHTML('beforeend','<button id="admin-logout" class="small-button">Sign out</button>');$('#admin-logout').onclick=async()=>{await api('/auth/logout','POST',{});location.href='/login';};await refresh();}
document.addEventListener('click',e=>{if(e.target.id==='show-key'){const input=$('#automation-key');input.type=input.type==='password'?'text':'password';}});
