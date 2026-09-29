import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const source='reference_docs/workflows',out='n8n/ready';fs.mkdirSync(out,{recursive:true});
const read=f=>JSON.parse(fs.readFileSync(`${source}/${f}`,'utf8').replace(/^\uFEFF/,''));
function clean(w,name){w.name=name;w.active=false;w.pinData={};delete w.id;delete w.versionId;delete w.meta;for(const n of w.nodes){delete n.credentials;if(n.type==='n8n-nodes-base.gmail')n.disabled=true;}return w;}
const write=(f,w)=>fs.writeFileSync(`${out}/${f}`,JSON.stringify(w,null,2)+'\n');
const node=(w,name)=>w.nodes.find(n=>n.name===name);
const connect=(w,from,to)=>w.connections[from]={main:[[{node:to,type:'main',index:0}]]};
function code(w,name,jsCode){const n=node(w,name);n.type='n8n-nodes-base.code';n.typeVersion=2;n.parameters={jsCode};delete n.credentials;delete n.disabled;return n;}
function addCode(w,name,jsCode,position){const n={id:randomUUID(),name,type:'n8n-nodes-base.code',typeVersion:2,parameters:{jsCode},position};w.nodes.push(n);return n;}
function http(w,name,url,method='GET',jsonBody){const n=node(w,name);n.type='n8n-nodes-base.httpRequest';n.typeVersion=4.2;n.parameters={method,url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{}};if(method!=='GET')Object.assign(n.parameters,{sendBody:true,specifyBody:'json',jsonBody:jsonBody||'{}'});delete n.credentials;delete n.disabled;return n;}
const configCode="const input = $input.first().json;\nreturn [{json: {...input, shopBaseUrl: 'http://host.docker.internal:3000'}}];";
const orderUrl=suffix=>`={{ $('Workflow Config').first().json.shopBaseUrl + '/api/automation/orders/' + encodeURIComponent($('Get Order').first().json.id) + '${suffix}' }}`;

// Lookup subworkflow: the customer's email is supplied by the calling workflow, never by AI.
const lookup=clean(read('Order-Lookup-Tool (1).json'),'Order Lookup Tool — Shop API');
node(lookup,'When Executed by Another Workflow').parameters.workflowInputs.values.push({name:'customer_email'});
addCode(lookup,'Workflow Config',configCode,[120,100]);
connect(lookup,'When Executed by Another Workflow','Workflow Config');connect(lookup,'Workflow Config','Get row(s)');
http(lookup,'Get row(s)',"={{ $('Workflow Config').first().json.shopBaseUrl + '/api/automation/order-lookup' }}",'POST',"={{ JSON.stringify({order_id: $('When Executed by Another Workflow').first().json.order_id, customer_email: $('When Executed by Another Workflow').first().json.customer_email}) }}");
code(lookup,'Edit Fields','return $input.all();');
write('Order-Lookup-Shop.json',lookup);

// Keep the user's logistics topology, but replace mock reads and writes with shop API calls.
const logistics=clean(read('Logistics-Delivery-Automation-3.json'),'Logistics & Delivery — Shop API');
addCode(logistics,'Workflow Config',configCode,[180,-500]);
connect(logistics,'Order Ready For Shipment','Workflow Config');connect(logistics,'Test Manually','Workflow Config');connect(logistics,'Workflow Config','Get Order');
node(logistics,'Order Ready For Shipment').parameters.responseMode='onReceived';
http(logistics,'Get Order',"={{ $('Workflow Config').first().json.shopBaseUrl + '/api/automation/orders/' + encodeURIComponent($('Workflow Config').first().json.body?.order_id || 'SET_ORDER_ID_FOR_MANUAL_TEST') }}");
const validator=node(logistics,'Validate Order');validator.parameters.jsCode=validator.parameters.jsCode.replace("if (order.status !== 'ready_for_shipment')", "if (!['ready_for_shipment','packing'].includes(order.status))").replace('computedTotal = Math.round(computedTotal * 100) / 100;','computedTotal = Math.round((computedTotal + Number(order.shipping_amount || 0)) * 100) / 100;');
code(logistics,'Check Duplicate',"return $input.all().map(({json:o})=>{const errors=[...(o.validationErrors||[])];if(o.shipment)errors.push('Shipment already exists; do not send duplicate notifications');return {json:{...o,duplicate:!!o.shipment,validationErrors:errors,isValid:errors.length===0}};});");
http(logistics,'Check Stock',orderUrl('/stock'));
http(logistics,'Reserve Stock',orderUrl('/reserve'),'POST');
const reserved=structuredClone(node(logistics,'Is Stock Available'));reserved.id=randomUUID();reserved.name='Reservation Succeeded';reserved.position=[-500,-200];reserved.parameters.conditions.conditions[0].leftValue='={{ $json.inventoryReserved }}';logistics.nodes.push(reserved);
connect(logistics,'Reserve Stock','Reservation Succeeded');logistics.connections['Reservation Succeeded']={main:[[{node:'Update Inventory',type:'main',index:0}],[{node:'Escalate To Human',type:'main',index:0}]]};
code(logistics,'Update Inventory',"const o=$input.first().json; if(!o.inventoryReserved) throw new Error('Reservation failed; inspect this order in admin operations. No stock was deducted.'); return [{json:o}];");
code(logistics,'Update Product Availability','return $input.all(); // Availability is already updated atomically by the shop reservation API.');
code(logistics,'Create Warehouse Task',"const o=$input.first().json; return [{json:{order_id:o.id,warehouse_task_id:o.warehouse.taskId,warehouse_status:o.warehouse.status,warehouse_check_number:0}}];");
for(const name of ['Wait For Warehouse Update','Wait Before Status Check'])node(logistics,name).parameters={resume:'timeInterval',amount:5,unit:'seconds'};
const whRead={id:randomUUID(),name:'Read Warehouse From Shop',position:[-550,0]};logistics.nodes.push(whRead);http(logistics,whRead.name,orderUrl('/warehouse'));
connect(logistics,'Wait For Warehouse Update',whRead.name);connect(logistics,whRead.name,'Check Warehouse Status');
code(logistics,'Check Warehouse Status',"const state=$input.first().json;const check=Number($('Wait For Warehouse Update').first().json.warehouse_check_number||0)+1;return [{json:{...state,warehouse_check_number:check,max_checks:240,warehouse_status:check>=240&&['pending','packaging'].includes(state.warehouse_status)?'warehouse_timeout':state.warehouse_status}}];");
http(logistics,'Create Shipment',orderUrl('/ship'),'POST');
node(logistics,'Get Tracking Number').parameters.assignments.assignments.find(a=>a.name==='tracking_url').value='={{ $json.tracking_url }}';
code(logistics,'Update Order Shipped',"return $input.all(); // Create Shipment has already persisted the shipment and shipped status.");
const deliveryRead={id:randomUUID(),name:'Read Shipment From Shop',position:[-550,300]};logistics.nodes.push(deliveryRead);http(logistics,deliveryRead.name,orderUrl('/shipment'));
connect(logistics,'Wait Before Status Check',deliveryRead.name);connect(logistics,deliveryRead.name,'Get Delivery Status');
code(logistics,'Get Delivery Status',"const state=$input.first().json;const previous=$('Wait Before Status Check').first().json;const check=Number(previous.delivery_check_number||0)+1;return [{json:{...state,delivery_check_number:check,max_checks:240,status:check>=240&&['in_transit','delayed'].includes(state.status)?'tracking_timeout':state.status}}];");
code(logistics,'Update Order In Transit','return $input.all(); // Courier status comes from the shop; do not invent scans.');
code(logistics,'Update Order Delayed','return $input.all(); // Courier status has already been persisted.');
http(logistics,'Update Order Delivered',orderUrl('/delivery'),'POST','{"status":"delivered"}');
http(logistics,'Reconcile Payment',orderUrl('/reconcile'),'POST');
http(logistics,'Escalate To Human',orderUrl('/escalate'),'POST',"={{ JSON.stringify({reason: $json.validationErrors?.join('; ') || $json.stockErrors?.join('; ') || $json.discrepancyReason || $json.warehouse_status || $json.status || 'Manual logistics review required'}) }}");
logistics.nodeGroups=[];
write('Logistics-Shop.json',logistics);

function fixSupport(w,inputName){
 w.nodes.push({id:randomUUID(),name:'Load KB Manually',type:'n8n-nodes-base.manualTrigger',typeVersion:1,parameters:{},position:[1950,0]});connect(w,'Load KB Manually','Download file');
 const tool=node(w,"Call 'Order Lookup Tool'");tool.parameters.workflowId={__rl:true,mode:'list',value:'SELECT_IMPORTED_LOOKUP_WORKFLOW'};
 tool.parameters.workflowInputs.value.customer_email=`={{ (String($('${inputName}').first().json.From || '').match(/<([^>]+)>/)?.[1] || String($('${inputName}').first().json.From || '')).trim().toLowerCase() }}`;
 tool.parameters.workflowInputs.schema.push({id:'customer_email',displayName:'customer_email',type:'string',required:true,display:true,canBeUsedToMatch:true});
 tool.parameters.description+=' Customer email is bound to the incoming authenticated website ticket or email sender by the workflow; only order_id is supplied by the model. Shop order IDs look like LC-1001. If found=false, ask for the correct reference without inventing a status.';
 for(const n of w.nodes){if(n.type==='n8n-nodes-base.dataTable'){const mapping=n.parameters.columns?.value;if(mapping?.customer_email)mapping.customer_email=tool.parameters.workflowInputs.value.customer_email;n.parameters.dataTableId={__rl:true,mode:'list',value:'SELECT_CONVERSATION_CONTEXT_TABLE'};}}
 node(w,'Switch') && (w.connections.Switch.main[4]=[{node:'AI Agent',type:'main',index:0}]);
 node(w,'AI Agent').parameters.options.systemMessage+='\nFor order lookups, accept LC-prefixed references such as LC-1001. Never assume numeric-only IDs. A tool response with found=false means the order did not match this customer. Do not expose another customer’s details.';
}
const gmail=clean(read('E-commerce (1).json'),'E-commerce support — Gmail + Shop Lookup');fixSupport(gmail,'Gmail Trigger');write('E-commerce-Gmail-Shop.json',gmail);
const web=clean(read('E-commerce (1).json'),'E-commerce support — Website tickets');
// Replace Gmail-only triggers and message fields; the agent and classification branches stay intact.
const trigger=node(web,'Gmail Trigger');trigger.type='n8n-nodes-base.webhook';trigger.typeVersion=2;trigger.parameters={httpMethod:'POST',path:'larkspur-support',responseMode:'onReceived',options:{}};trigger.name='Website Support Webhook';trigger.webhookId=randomUUID();
for(const n of web.nodes)n.parameters=JSON.parse(JSON.stringify(n.parameters).replaceAll("$('Gmail Trigger')","$('Support Input')"));
const normalize=addCode(web,'Support Input',"const e=$input.first().json.body; const t=e.ticket;if(e.type!=='support.created'||!t?.id||!t?.email)return [];return [{json:{id:t.id,threadId:'website:'+t.id,From:t.email,Subject:'Website support '+t.id,snippet:t.message+(t.orderId?'\\nOrder reference: '+t.orderId:''),shopBaseUrl:'http://host.docker.internal:3000'}}];",[-1000,-350]);
delete web.connections['Gmail Trigger'];connect(web,'Website Support Webhook','Support Input');connect(web,'Support Input','Get row(s)1');
fixSupport(web,'Support Input');
http(web,'Reply to a message',"={{ $('Support Input').first().json.shopBaseUrl + '/api/support/' + $('Support Input').first().json.id + '/replies' }}",'POST',"={{ JSON.stringify({message: $('AI Agent').first().json.output, status: JSON.parse($('Message a model').first().json.content.parts[0].text).requires_human ? 'escalated' : 'resolved'}) }}");
http(web,'Send a message1',"={{ $('Support Input').first().json.shopBaseUrl + '/api/support/' + $('Support Input').first().json.id }}",'PATCH','{"status":"escalated"}');
write('E-commerce-Website-Shop.json',web);

// Updated ordering workflow uses the API credential and delegates logistics when configured.
const ordering=JSON.parse(fs.readFileSync('n8n/larkspur-order-workflow.json','utf8').replace(/^\uFEFF/,''));
node(ordering,'Choose order action').parameters.jsCode="const event=$input.first().json.body;let action=event.type==='order.created'?'validate':null;if(!event.logisticsManaged){const actions={'order.confirmed':'reserve','warehouse.ready':'ship'};action=action||actions[event.type];if(event.type==='shipment.updated'&&event.order?.shipment?.status==='delivered')action='reconcile';}if(!action||!event.order?.id)return [];return [{json:{url:'http://host.docker.internal:3000/api/orders/'+encodeURIComponent(event.order.id)+'/'+action,eventId:event.id,action}}];";
node(ordering,'Update demo shop').parameters.authentication='genericCredentialType';node(ordering,'Update demo shop').parameters.genericAuthType='httpHeaderAuth';
fs.writeFileSync('n8n/larkspur-order-workflow.json',JSON.stringify(ordering,null,2)+'\n');write('Ordering-Shop.json',ordering);
console.log('Prepared 5 importable workflows; originals unchanged.');
