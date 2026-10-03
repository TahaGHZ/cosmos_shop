// Compatibility fields for the supplied n8n workflows; canonical shop data stays intact.
export function workflowOrder(o,baseUrl){return {...o,order_id:o.id,customer_email:o.customer.email,shipping_address:o.shippingAddress||{street:o.customer.address,city:'',postal_code:'',country:''},products:o.items.map(i=>({sku:i.productId,name:i.name,qty:i.quantity,price:i.unitPrice})),total_amount:o.total,shipping_amount:o.shipping,paid_amount:o.payment.amount??(['authorized','settled'].includes(o.payment.status)?o.total:0),payment_status:['authorized','settled'].includes(o.payment.status)?'paid':o.payment.status,processing_status:o.status,status:o.status==='confirmed'?'ready_for_shipment':o.status==='packing'&&o.warehouse?.status==='ready'?'ready_for_shipment':o.shipment?.status==='delayed'?'delayed':o.status,tracking_number:o.shipment?.trackingNumber||null,estimated_delivery:o.shipment?.estimatedDelivery||null,tracking_url:o.shipment?`${baseUrl}/?order=${o.id}`:null,warehouse_status:o.warehouse?.status||null,shipment_id:o.shipment?.id||null,confirmation_url:`${baseUrl}/?order=${o.id}&token=${o.confirmationToken}`};}
export function lookupOrder(o){return {found:true,order_id:o.id,customer_email:o.customer.email,status:o.shipment?.status==='delayed'?'delayed':o.status,tracking_number:o.shipment?.trackingNumber||null,estimated_delivery:o.shipment?.estimatedDelivery||null,carrier:o.shipment?.carrier||null,payment_status:o.payment.status};}

export function inspectOrder(o, products, phase='order'){
  const errors=[];
  if(phase==='fulfillment'&&!['confirmed','packing'].includes(o.status))errors.push('Order is not ready for fulfillment');
  if(!o.customer?.name||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.customer?.email||''))errors.push('Customer details missing');
  if(!o.shippingAddress?.street||!o.shippingAddress?.city||!o.shippingAddress?.postal_code||!o.shippingAddress?.country)errors.push('Complete shipping address required');
  if(!Array.isArray(o.items)||!o.items.length)errors.push('No products');
  for(const item of o.items||[]){
    const product=products.find(p=>p.id===item.productId);
    if(!product||!Number.isInteger(item.quantity)||item.quantity<1||!Number.isFinite(item.unitPrice)||item.unitPrice<0)errors.push(`Invalid item: ${item.productId||'unknown'}`);
    else if(!o.inventoryReserved&&product.stock<item.quantity)errors.push(`Insufficient stock: ${item.productId}`);
  }
  const expected=(o.items||[]).reduce((sum,item)=>sum+item.quantity*item.unitPrice,0)+Number(o.shipping||0);
  if(!Number.isFinite(expected)||Math.abs(expected-o.total)>.01)errors.push('Total does not match items and shipping');
  if(o.currency!=='EUR'||o.payment?.status!=='authorized'||Math.abs(Number(o.payment?.amount||0)-o.total)>.01)errors.push('Payment requires human review');
  if(o.shipment)errors.push('Shipment already exists');
  return {order_id:o.id,valid:errors.length===0,errors,stockAvailable:!errors.some(e=>e.startsWith('Insufficient stock:')),duplicate:!!o.shipment};
}

export function orderEventDecision(o,eventType){
  let action='sync';
  if(o.status==='received'&&(!eventType||eventType==='order.created'))action='validate';
  if(o.status==='confirmed'&&eventType==='order.confirmed'&&!o.logisticsHandoff?.acceptedAt)action='handoff';
  return {order_id:o.id,action,status:o.status,eventType:eventType||null};
}

export function dueFollowups(orders,now=Date.now(),remindAfterHours=24,reviewAfterHours=72){
  return orders.filter(o=>o.status==='awaiting_confirmation').flatMap(o=>{
    const hours=(now-Date.parse(o.createdAt))/3600000;
    if(hours>=reviewAfterHours){
      const reason=`Customer has not confirmed within ${reviewAfterHours} hours`;
      return o.reviewReason===reason?[]:[{order_id:o.id,action:'escalate',reason}];
    }
    return hours>=remindAfterHours&&(!o.lastReminderAt||now-Date.parse(o.lastReminderAt)>=86400000)?[{order_id:o.id,action:'remind'}]:[];
  });
}

export function triageTicket(ticket,order){
  const messages=Array.isArray(ticket.messages)&&ticket.messages.length?ticket.messages:[{role:'customer',content:ticket.message}];
  const threadText=messages.map(m=>String(m.content||m.message||'')).join('\n').toLowerCase();
  const latest=messages.at(-1);
  const category=/refund|cancel|return/.test(threadText)?'returns':/ship|deliver|track|package/.test(threadText)?'delivery':/stock|available|product/.test(threadText)?'product':'general';
  const priority=/urgent|missing|lost|damag|wrong/.test(threadText)||order?.shipment?.status==='exception'?'high':'normal';
  const orderContext=order?`Order ${order.id} is ${order.shipment?.status||order.status.replaceAll('_',' ')}.`:'No linked order was provided.';
  const threadSummary=`${messages.length} message${messages.length===1?'':'s'} in this conversation. Latest from ${latest?.role||'customer'}: ${String(latest?.content||latest?.message||ticket.message).slice(0,180)}`;
  return {category,priority,orderContext,threadId:ticket.threadId||`thread:${ticket.id}`,messageCount:messages.length,threadSummary,suggestedReply:`Thanks for contacting us. ${orderContext} A team member will review your request before replying.`};
}
