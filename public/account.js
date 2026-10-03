import {api,esc,money,toast} from './app.js';
const $=s=>document.querySelector(s);let mode='login';
const next=()=>{const value=new URLSearchParams(location.search).get('next');return value&&value.startsWith('/')&&!value.startsWith('//')?value:null;};

if($('#auth-form')){
 function setMode(m){mode=m;$('#name-label').hidden=m==='login';$('#name-label input').required=m==='register';$('#auth-submit').textContent=m==='login'?'Sign in ↗':'Create account ↗';$('#auth-error').textContent='';}
 $('#login-mode').onclick=()=>setMode('login');$('#register-mode').onclick=()=>setMode('register');
 $('#auth-form').onsubmit=async e=>{e.preventDefault();$('#auth-submit').disabled=true;try{const {user}=await api('/auth/'+mode,'POST',Object.fromEntries(new FormData(e.target)));location.href=next()||(user.role==='admin'?'/admin':'/account');}catch(error){$('#auth-error').textContent=error.message;}finally{$('#auth-submit').disabled=false;}};
}

if($('#my-orders')){
 let tickets=[];
 const renderTickets=()=>$('#my-tickets').innerHTML=tickets.length?tickets.map(t=>`<article class="panel account-ticket"><h3>${esc(t.id)} <span class="pill">${esc(t.status)}</span></h3>${(t.messages||[{role:'customer',content:t.message,at:t.createdAt}]).map(m=>`<div class="thread-message ${m.role==='customer'?'from-customer':'from-staff'}"><b>${esc(m.role==='customer'?'You':'Larkspur support')}</b><p>${esc(m.content||m.message)}</p><small>${new Date(m.at).toLocaleString()}</small></div>`).join('')}<form class="thread-reply" data-ticket-thread="${esc(t.id)}"><label>Continue this conversation<textarea name="message" required rows="2" placeholder="Add details or reply to support"></textarea></label><button class="small-button">Send follow-up ↗</button></form></article>`).join(''):'<p class="muted">No support messages yet. Use “Need a hand?” in the shop.</p>';
 try{
  const {user}=await api('/auth/me');
  if(!user)location.replace('/login?next=/account');
  else{
   $('#welcome').textContent=`Welcome home, ${user.name}.`;$('#account-email').textContent=user.email;$('#admin-link').hidden=user.role!=='admin';
   const [orders,support]=await Promise.all([api('/orders'),api('/support')]);tickets=support;
   const steps=['Order received','Confirmation','Preparing','Shipped','Delivered'];
   const progress=o=>{const index=o.status==='delivered'?4:['shipped'].includes(o.status)?3:['confirmed','packing'].includes(o.status)?2:o.status==='awaiting_confirmation'?1:0;return `<p class="muted progress-caption">Order progress</p><ol class="order-progress">${steps.map((s,i)=>`<li class="${i<=index?'done':''}">${s}</li>`).join('')}</ol>`;};
   $('#my-orders').innerHTML=orders.length?orders.map(o=>`<article class="panel account-order"><h3>${esc(o.id)} <span class="pill">${esc(o.status.replaceAll('_',' '))}</span></h3>${progress(o)}<p>${o.items.map(i=>`${i.quantity} × ${esc(i.name)}`).join('<br>')}</p><p><b>${money(o.total)}</b> · Placed ${new Date(o.createdAt).toLocaleDateString()}</p>${o.shipment?`<p><b>${esc(o.shipment.trackingNumber||'Tracking pending')}</b><br>${esc(o.shipment.carrier||'Demo courier')} · ${esc(o.shipment.status.replaceAll('_',' '))}${o.shipment.estimatedDelivery?` · ETA ${esc(new Date(o.shipment.estimatedDelivery).toLocaleDateString())}`:''}</p>`:''}${o.warehouse?`<p class="muted">Warehouse: ${esc(o.warehouse.status.replaceAll('_',' '))}</p>`:''}<details><summary>Order details</summary><p>Payment: ${esc(o.payment.status.replaceAll('_',' '))}<br>Ship to: ${esc(o.customer.address||'Address on file')}</p></details><div class="actions"><a class="small-button" href="/?order=${encodeURIComponent(o.id)}">Review order ↗</a></div></article>`).join(''):'<p class="empty">Your first favorite is waiting for you.</p>';
   renderTickets();
  }
 }catch(e){toast(e.message);}
 $('#logout').onclick=async()=>{await api('/auth/logout','POST',{});location.href='/';};
 document.addEventListener('submit',async e=>{const form=e.target.closest('[data-ticket-thread]');if(!form)return;e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await api(`/support/${encodeURIComponent(form.dataset.ticketThread)}/messages`,'POST',{message:new FormData(form).get('message')});tickets=await api('/support');renderTickets();toast('Your message was added to the conversation.');}catch(err){toast(err.message);}finally{button.disabled=false;}});
}
