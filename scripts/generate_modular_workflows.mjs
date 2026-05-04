import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const workflowIds = {
  router: 'lc-router-001',
  conversation: 'lc-conversation-001',
  orderCreate: 'lc-order-create-001',
  riderUpdate: 'lc-rider-update-001',
  sendWhatsApp: 'lc-send-whatsapp-001',
};

const postgresCredential = {
  postgres: {
    id: 'local-postgres-mvp',
    name: 'Local Postgres MVP',
  },
};

const googleSheetsCredential = {
  googleSheetsOAuth2Api: {
    id: 'google-sheets-mirror',
    name: 'Google Sheets Mirror',
  },
};

const positions = {
  col1: 240,
  col2: 520,
  col3: 820,
  col4: 1120,
  col5: 1420,
  col6: 1720,
  col7: 2020,
  col8: 2320,
  col9: 2620,
  col10: 2920,
  row1: 180,
  row2: 360,
  row3: 540,
  row4: 720,
};

const code = (js) => ({
  mode: 'runOnceForAllItems',
  language: 'javaScript',
  jsCode: js.trim(),
});

const execWorkflowParams = (workflowId) => ({
  source: 'database',
  workflowId: {
    value: workflowId,
    mode: 'list',
  },
  workflowInputs: {
    mappingMode: 'defineBelow',
    value: null,
  },
  mode: 'each',
  options: {
    waitForSubWorkflow: false,
  },
});

const setManualFields = (values) => ({
  mode: 'manual',
  fields: {
    values,
  },
  include: 'none',
  options: {},
});

const setField = (name, stringValue) => ({
  name,
  type: 'stringValue',
  stringValue,
});

const switchRule = (value2, outputKey) => ({
  operation: 'equal',
  value2,
  outputKey,
});

const routerWorkflow = {
  id: workflowIds.router,
  name: 'whatsapp-inbound-router',
  active: false,
  nodes: [
    {
      parameters: {
        httpMethod: 'GET',
        path: 'whatsapp-inbound',
        responseMode: 'responseNode',
        options: {},
      },
      id: 'router-webhook-verify',
      name: 'Webhook Verification',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [positions.col1, positions.row1],
      webhookId: 'whatsapp-inbound-router-get',
    },
    {
      parameters: {
        httpMethod: 'POST',
        path: 'whatsapp-inbound',
        responseMode: 'responseNode',
        options: {},
      },
      id: 'router-webhook-post',
      name: 'Webhook Inbound',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      position: [positions.col1, positions.row3],
      webhookId: 'whatsapp-inbound-router-post',
    },
    {
      parameters: code(`
const item = $input.first().json;
const query = item.query ?? {};
const body = item.body ?? {};
const challenge = query['hub.challenge'] ?? query.challenge ?? null;
const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ?? null;
const senderName = body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name ?? '';
if (challenge) {
  return [{ json: { request_kind: 'verification', challenge: String(challenge), action_taken: 'meta_verification' } }];
}
if (!message || !message.from) {
  return [{ json: { request_kind: 'ignore', reason: 'unsupported_payload', action_taken: 'ignore_unsupported_payload' } }];
}
return [{
  json: {
    request_kind: 'message',
    phone: String(message.from),
    message_text: String(message?.text?.body ?? ''),
    message_id: String(message.id ?? ''),
    timestamp: String(message.timestamp ?? ''),
    sender_name: String(senderName),
    raw_body: body,
    action_taken: 'router_normalized',
  },
}];
      `),
      id: 'router-normalize',
      name: 'Normalize Router Payload',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [positions.col2, positions.row2],
    },
    {
      parameters: {
        mode: 'rules',
        dataType: 'string',
        value1: '={{ $json.request_kind }}',
        rules: {
          rules: [
            switchRule('verification', 'verification'),
            switchRule('message', 'message'),
            switchRule('ignore', 'ignore'),
          ],
        },
      },
      id: 'router-request-switch',
      name: 'Route Request Kind',
      type: 'n8n-nodes-base.switch',
      typeVersion: 2,
      position: [positions.col3, positions.row2],
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: "SELECT $1::text AS phone, $2::text AS message_text, $3::text AS message_id, $4::text AS timestamp, $5::text AS sender_name, EXISTS (SELECT 1 FROM riders WHERE phone = $1 AND active = true) AS rider_exists;",
        options: {
          queryReplacement: '={{ [$json.phone, $json.message_text, $json.message_id, $json.timestamp, $json.sender_name] }}',
        },
      },
      id: 'router-check-rider',
      name: 'Lookup Rider',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [positions.col4, positions.row2],
      credentials: postgresCredential,
    },
    {
      parameters: code(`
const item = $input.first().json;
const actorType = item.rider_exists ? 'rider' : 'customer';
return [{ json: { ...item, actor_type: actorType, action_taken: actorType === 'rider' ? 'route_to_rider' : 'route_to_customer' } }];
      `),
      id: 'router-decide-actor',
      name: 'Decide Actor',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [positions.col5, positions.row2],
    },
    {
      parameters: {
        mode: 'rules',
        dataType: 'string',
        value1: '={{ $json.actor_type }}',
        rules: {
          rules: [
            switchRule('rider', 'rider'),
            switchRule('customer', 'customer'),
          ],
        },
      },
      id: 'router-actor-switch',
      name: 'Route Actor',
      type: 'n8n-nodes-base.switch',
      typeVersion: 2,
      position: [positions.col6, positions.row2],
    },
    {
      parameters: execWorkflowParams(workflowIds.riderUpdate),
      id: 'router-call-rider',
      name: 'Call Rider Update',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [positions.col7, positions.row1],
    },
    {
      parameters: execWorkflowParams(workflowIds.conversation),
      id: 'router-call-customer',
      name: 'Call Conversation Engine',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [positions.col7, positions.row3],
    },
    {
      parameters: {
        respondWith: 'text',
        responseBody: '={{ $json.challenge }}',
        options: {},
      },
      id: 'router-respond-verification',
      name: 'Respond Verification',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.5,
      position: [positions.col4, positions.row1],
    },
    {
      parameters: {
        respondWith: 'noData',
        options: {},
      },
      id: 'router-respond-post',
      name: 'Respond 200 Fast',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.5,
      position: [positions.col7, positions.row2],
    },
  ],
  connections: {
    'Webhook Verification': {
      main: [[{ node: 'Normalize Router Payload', type: 'main', index: 0 }]],
    },
    'Webhook Inbound': {
      main: [[{ node: 'Normalize Router Payload', type: 'main', index: 0 }]],
    },
    'Normalize Router Payload': {
      main: [[{ node: 'Route Request Kind', type: 'main', index: 0 }]],
    },
    'Route Request Kind': {
      main: [
        [{ node: 'Respond Verification', type: 'main', index: 0 }],
        [{ node: 'Lookup Rider', type: 'main', index: 0 }],
        [{ node: 'Respond 200 Fast', type: 'main', index: 0 }],
      ],
    },
    'Lookup Rider': {
      main: [[{ node: 'Decide Actor', type: 'main', index: 0 }]],
    },
    'Decide Actor': {
      main: [[{ node: 'Route Actor', type: 'main', index: 0 }]],
    },
    'Route Actor': {
      main: [
        [{ node: 'Call Rider Update', type: 'main', index: 0 }],
        [{ node: 'Call Conversation Engine', type: 'main', index: 0 }],
      ],
    },
    'Call Rider Update': {
      main: [[{ node: 'Respond 200 Fast', type: 'main', index: 0 }]],
    },
    'Call Conversation Engine': {
      main: [[{ node: 'Respond 200 Fast', type: 'main', index: 0 }]],
    },
  },
  settings: {
    executionOrder: 'v1',
  },
  staticData: null,
  pinData: {},
  meta: {
    templateCredsSetupCompleted: false,
  },
  tags: [],
};

const conversationWorkflow = {
  id: workflowIds.conversation,
  name: 'conversation-engine',
  active: false,
  nodes: [
    {
      parameters: {
        inputSource: 'passthrough',
      },
      id: 'conversation-trigger',
      name: 'When Executed by Another Workflow',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      position: [positions.col1, positions.row2],
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: "SELECT $1::text AS phone, $2::text AS message_text, $3::text AS message_id, $4::text AS sender_name, $5::text AS inbound_timestamp, EXISTS (SELECT 1 FROM orders WHERE message_id = $3) AS order_message_exists, cs.state, cs.name, cs.product, cs.quantity, cs.address, cs.payment_type, cs.draft_order, cs.updated_at FROM (SELECT 1) seed LEFT JOIN conversation_state cs ON cs.phone = $1;",
        options: {
          queryReplacement: '={{ [$json.phone, $json.message_text, $json.message_id, $json.sender_name, $json.timestamp] }}',
        },
      },
      id: 'conversation-fetch-state',
      name: 'Fetch Conversation State',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [positions.col2, positions.row2],
      credentials: postgresCredential,
    },
    {
      parameters: code(`
const row = $input.first().json;
const now = new Date();
const normalized = String(row.message_text ?? '').trim();
const lower = normalized.toLowerCase();
if (row.order_message_exists) {
  return [{
    json: {
      phone: row.phone,
      message_id: row.message_id,
      route: 'ignore',
      action_taken: 'duplicate_message_ignored',
    },
  }];
}
let state = row.state || 'idle';
let name = row.name || '';
let product = row.product || '';
let quantity = row.quantity ?? null;
let address = row.address || '';
let paymentType = row.payment_type || '';
const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
if (updatedAt && state !== 'idle' && now.getTime() - updatedAt.getTime() > 30 * 60 * 1000) {
  state = 'idle';
  name = '';
  product = '';
  quantity = null;
  address = '';
  paymentType = '';
}
let responseText = '';
let route = 'persist';
let nextState = state;
const confirmSet = new Set(['si', 'sí', 'ok', 'confirmo', 'dale']);
const cancelSet = new Set(['no', 'cancelar']);
switch (state) {
  case 'idle':
    nextState = 'ASK_NAME';
    responseText = 'Hola, ¿Cuál es tu nombre?';
    break;
  case 'ASK_NAME':
    name = normalized || row.sender_name || '';
    nextState = 'ASK_PRODUCT';
    responseText = '¿Qué deseas pedir?';
    break;
  case 'ASK_PRODUCT':
    product = normalized;
    nextState = 'ASK_QUANTITY';
    responseText = '¿Cuántos?';
    break;
  case 'ASK_QUANTITY': {
    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      nextState = 'ASK_QUANTITY';
      responseText = 'Indica una cantidad válida en número. ¿Cuántos?';
    } else {
      quantity = parsed;
      nextState = 'ASK_ADDRESS';
      responseText = '¿Dirección?';
    }
    break;
  }
  case 'ASK_ADDRESS':
    address = normalized;
    nextState = 'ASK_PAYMENT_TYPE';
    responseText = '¿Pago efectivo o transferencia?';
    break;
  case 'ASK_PAYMENT_TYPE': {
    if (lower.includes('efectivo')) {
      paymentType = 'efectivo';
      nextState = 'CONFIRM_ORDER';
      responseText = \`Resumen:\\nNombre: \${name}\\nProducto: \${product}\\nCantidad: \${quantity}\\nDirección: \${address}\\nPago: \${paymentType}\\n\\nResponde SI para confirmar o NO para cancelar.\`;
    } else if (lower.includes('transfer')) {
      paymentType = 'transferencia';
      nextState = 'CONFIRM_ORDER';
      responseText = \`Resumen:\\nNombre: \${name}\\nProducto: \${product}\\nCantidad: \${quantity}\\nDirección: \${address}\\nPago: \${paymentType}\\n\\nResponde SI para confirmar o NO para cancelar.\`;
    } else {
      nextState = 'ASK_PAYMENT_TYPE';
      responseText = 'Indica un medio de pago válido: efectivo o transferencia.';
    }
    break;
  }
  case 'CONFIRM_ORDER':
    if (confirmSet.has(lower)) {
      route = 'create_order';
      nextState = 'idle';
    } else if (cancelSet.has(lower)) {
      route = 'persist';
      nextState = 'idle';
      name = '';
      product = '';
      quantity = null;
      address = '';
      paymentType = '';
      responseText = 'Pedido cancelado.';
    } else {
      nextState = 'CONFIRM_ORDER';
      responseText = \`Resumen:\\nNombre: \${name}\\nProducto: \${product}\\nCantidad: \${quantity}\\nDirección: \${address}\\nPago: \${paymentType}\\n\\nResponde SI para confirmar o NO para cancelar.\`;
    }
    break;
  default:
    nextState = 'ASK_NAME';
    responseText = 'Hola, ¿Cuál es tu nombre?';
    break;
}
const draftOrder = route === 'create_order'
  ? {}
  : { name, product, quantity, address, payment_type: paymentType };
return [{
  json: {
    phone: row.phone,
    message_text: row.message_text,
    message_id: row.message_id,
    sender_name: row.sender_name,
    route,
    state: nextState,
    name,
    product,
    quantity,
    address,
    payment_type: paymentType,
    draft_order: draftOrder,
    response_text: responseText,
    customer_phone: row.phone,
    customer_name: name || row.sender_name || '',
    action_taken: route === 'create_order' ? 'conversation_confirmed_create_order' : 'conversation_state_' + nextState.toLowerCase(),
  },
}];
      `),
      id: 'conversation-evaluate',
      name: 'Evaluate State Machine',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [positions.col3, positions.row2],
    },
    {
      parameters: {
        mode: 'rules',
        dataType: 'string',
        value1: '={{ $json.route }}',
        rules: {
          rules: [
            switchRule('persist', 'persist'),
            switchRule('create_order', 'create_order'),
            switchRule('ignore', 'ignore'),
          ],
        },
      },
      id: 'conversation-route',
      name: 'Route Conversation Action',
      type: 'n8n-nodes-base.switch',
      typeVersion: 2,
      position: [positions.col4, positions.row2],
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: "INSERT INTO conversation_state (phone, state, name, product, quantity, address, payment_type, draft_order) VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, NULLIF($6, ''), NULLIF($7, ''), $8::jsonb) ON CONFLICT (phone) DO UPDATE SET state = EXCLUDED.state, name = EXCLUDED.name, product = EXCLUDED.product, quantity = EXCLUDED.quantity, address = EXCLUDED.address, payment_type = EXCLUDED.payment_type, draft_order = EXCLUDED.draft_order, updated_at = NOW() RETURNING phone, state;",
        options: {
          queryReplacement: '={{ [$json.phone, $json.state, $json.name || "", $json.product || "", $json.quantity, $json.address || "", $json.payment_type || "", JSON.stringify($json.draft_order || {})] }}',
        },
      },
      id: 'conversation-persist-state',
      name: 'Persist Conversation State',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [positions.col5, positions.row1],
      credentials: postgresCredential,
    },
    {
      parameters: setManualFields([
        setField('to', '={{ $items("Evaluate State Machine", 0, 0).first().json.customer_phone }}'),
        setField('body', '={{ $items("Evaluate State Machine", 0, 0).first().json.response_text }}'),
        setField('phone', '={{ $items("Evaluate State Machine", 0, 0).first().json.phone }}'),
        setField('message_id', '={{ $items("Evaluate State Machine", 0, 0).first().json.message_id }}'),
        setField('action_taken', '={{ $items("Evaluate State Machine", 0, 0).first().json.action_taken }}'),
      ]),
      id: 'conversation-build-reply',
      name: 'Build Customer Reply',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.1,
      position: [positions.col6, positions.row1],
    },
    {
      parameters: execWorkflowParams(workflowIds.sendWhatsApp),
      id: 'conversation-send-reply',
      name: 'Send Customer Reply',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [positions.col7, positions.row1],
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: "WITH upsert AS (INSERT INTO conversation_state (phone, state, name, product, quantity, address, payment_type, draft_order) VALUES ($1, 'idle', NULL, NULL, NULL, NULL, NULL, '{}'::jsonb) ON CONFLICT (phone) DO UPDATE SET state = 'idle', name = NULL, product = NULL, quantity = NULL, address = NULL, payment_type = NULL, draft_order = '{}'::jsonb, updated_at = NOW() RETURNING phone) SELECT $1::text AS phone, $2::text AS message_id, $3::text AS customer_phone, $4::text AS customer_name, $5::text AS product, $6::integer AS quantity, $7::text AS address, $8::text AS payment_type, 'reset_and_create_order'::text AS action_taken FROM upsert;",
        options: {
          queryReplacement: '={{ [$json.phone, $json.message_id, $json.customer_phone, $json.customer_name, $json.product, $json.quantity, $json.address, $json.payment_type] }}',
        },
      },
      id: 'conversation-reset-on-create',
      name: 'Reset State After Confirm',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [positions.col5, positions.row3],
      credentials: postgresCredential,
    },
    {
      parameters: execWorkflowParams(workflowIds.orderCreate),
      id: 'conversation-call-order-create',
      name: 'Call Order Create',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [positions.col6, positions.row3],
    },
  ],
  connections: {
    'When Executed by Another Workflow': {
      main: [[{ node: 'Fetch Conversation State', type: 'main', index: 0 }]],
    },
    'Fetch Conversation State': {
      main: [[{ node: 'Evaluate State Machine', type: 'main', index: 0 }]],
    },
    'Evaluate State Machine': {
      main: [[{ node: 'Route Conversation Action', type: 'main', index: 0 }]],
    },
    'Route Conversation Action': {
      main: [
        [{ node: 'Persist Conversation State', type: 'main', index: 0 }],
        [{ node: 'Reset State After Confirm', type: 'main', index: 0 }],
        [],
      ],
    },
    'Persist Conversation State': {
      main: [[{ node: 'Build Customer Reply', type: 'main', index: 0 }]],
    },
    'Build Customer Reply': {
      main: [[{ node: 'Send Customer Reply', type: 'main', index: 0 }]],
    },
    'Reset State After Confirm': {
      main: [[{ node: 'Call Order Create', type: 'main', index: 0 }]],
    },
  },
  settings: {
    executionOrder: 'v1',
  },
  staticData: null,
  pinData: {},
  meta: {
    templateCredsSetupCompleted: false,
  },
  tags: [],
};

const orderCreateWorkflow = {
  id: workflowIds.orderCreate,
  name: 'order-create',
  active: false,
  nodes: [
    {
      parameters: {
        inputSource: 'passthrough',
      },
      id: 'order-trigger',
      name: 'When Executed by Another Workflow',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      position: [positions.col1, positions.row2],
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: "SELECT $1::text AS message_id, $2::text AS phone, $3::text AS customer_phone, $4::text AS customer_name, $5::text AS product, $6::integer AS quantity, $7::text AS address, $8::text AS payment_type, EXISTS (SELECT 1 FROM orders WHERE message_id = $1) AS already_exists;",
        options: {
          queryReplacement: '={{ [$json.message_id, $json.phone || $json.customer_phone, $json.customer_phone || $json.phone, $json.customer_name || $json.name, $json.product, $json.quantity, $json.address, $json.payment_type] }}',
        },
      },
      id: 'order-check-idempotency',
      name: 'Check Message Idempotency',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [positions.col2, positions.row2],
      credentials: postgresCredential,
    },
    {
      parameters: code(`
const row = $input.first().json;
if (row.already_exists) {
  return [{ json: { ...row, route: 'duplicate', action_taken: 'duplicate_message_ignored' } }];
}
const phone = String(row.customer_phone || row.phone || '');
const last4 = phone.slice(-4).padStart(4, '0');
const now = new Date();
const parts = [
  now.getUTCFullYear(),
  String(now.getUTCMonth() + 1).padStart(2, '0'),
  String(now.getUTCDate()).padStart(2, '0'),
].join('');
const time = [
  String(now.getUTCHours()).padStart(2, '0'),
  String(now.getUTCMinutes()).padStart(2, '0'),
  String(now.getUTCSeconds()).padStart(2, '0'),
].join('');
return [{
  json: {
    ...row,
    route: 'create',
    order_code: \`LC-\${parts}-\${time}-\${last4}\`,
    action_taken: 'order_code_generated',
  },
}];
      `),
      id: 'order-build-code',
      name: 'Build Order Code',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [positions.col3, positions.row2],
    },
    {
      parameters: {
        mode: 'rules',
        dataType: 'string',
        value1: '={{ $json.route }}',
        rules: {
          rules: [
            switchRule('duplicate', 'duplicate'),
            switchRule('create', 'create'),
          ],
        },
      },
      id: 'order-route',
      name: 'Route Order Action',
      type: 'n8n-nodes-base.switch',
      typeVersion: 2,
      position: [positions.col4, positions.row2],
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: "INSERT INTO orders (order_code, message_id, customer_phone, customer_name, product, quantity, address, payment_type, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING *;",
        options: {
          queryReplacement: '={{ [$json.order_code, $json.message_id, $json.customer_phone || $json.phone, $json.customer_name || $json.name, $json.product, $json.quantity, $json.address, $json.payment_type] }}',
        },
      },
      id: 'order-insert',
      name: 'Insert Order',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [positions.col5, positions.row2],
      credentials: postgresCredential,
    },
    {
      parameters: code(`
const order = $input.first().json;
return [{
  json: {
    ...order,
    order_code: order.order_code,
    customer_phone: order.customer_phone,
    customer_name: order.customer_name,
    product: order.product,
    quantity: order.quantity,
    address: order.address,
    payment_type: order.payment_type,
    status: order.status,
    rider_phone: order.rider_phone || '',
    action_taken: 'order_created_prepared_for_mirror',
  },
}];
      `),
      id: 'order-prepare-sheets',
      name: 'Prepare Sheets Mirror',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [positions.col6, positions.row2],
    },
    {
      parameters: {
        mode: 'rules',
        dataType: 'string',
        value1: 'skip',
        rules: {
          rules: [
            switchRule('append', 'append'),
            switchRule('skip', 'skip'),
          ],
        },
      },
      id: 'order-route-sheets',
      name: 'Route Sheets Mirror',
      type: 'n8n-nodes-base.switch',
      typeVersion: 2,
      position: [positions.col7, positions.row2],
    },
    {
      parameters: {
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'googleSheetsOAuth2Api',
        resource: 'sheet',
        operation: 'append',
        documentId: {
          mode: 'id',
          value: '={{ $env.GOOGLE_SHEETS_DOCUMENT_ID || "SPREADSHEET_ID" }}',
        },
        sheetName: {
          mode: 'name',
          value: '={{ $env.GOOGLE_SHEETS_SHEET_NAME || "Orders" }}',
        },
        columns: {
          mappingMode: 'autoMapInputData',
          value: null,
        },
        options: {
          locationDefine: {
            values: {
              headerRow: 1,
            },
          },
          useAppend: true,
        },
      },
      id: 'order-google-sheets',
      name: 'Append Google Sheets Mirror',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.7,
      position: [positions.col7, positions.row1],
      onError: 'continueRegularOutput',
      credentials: googleSheetsCredential,
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: "SELECT r.phone, r.name FROM (SELECT 1) seed LEFT JOIN LATERAL (SELECT phone, name FROM riders WHERE active = true ORDER BY phone LIMIT 1) r ON TRUE;",
        options: {},
      },
      id: 'order-select-rider',
      name: 'Select Active Rider',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [positions.col8, positions.row2],
      credentials: postgresCredential,
    },
    {
      parameters: code(`
const order = $items('Prepare Sheets Mirror', 0, 0).first().json;
const rider = $input.first()?.json ?? null;
const items = [];
if (rider?.phone) {
  items.push({
    json: {
      to: rider.phone,
      body: \`Nuevo pedido \${order.order_code}\\nCliente: \${order.customer_name}\\nTeléfono: \${order.customer_phone}\\nProducto: \${order.product}\\nCantidad: \${order.quantity}\\nPago: \${order.payment_type}\\nDirección: \${order.address}\\n\\nPara confirmar: ENTREGADO \${order.order_code} \${order.payment_type}\`,
      phone: rider.phone,
      message_id: order.message_id,
      action_taken: 'notify_rider_new_order',
    },
  });
}
items.push({
  json: {
    to: order.customer_phone,
    phone: order.customer_phone,
    message_id: order.message_id,
    action_taken: rider?.phone ? 'notify_customer_order_dispatched' : 'notify_customer_order_registered',
    body: rider?.phone
      ? \`Tu pedido \${order.order_code} va en camino\`
      : \`Tu pedido \${order.order_code} fue registrado. Te avisaremos cuando salga a reparto.\`,
  },
});
return items;
      `),
      id: 'order-build-notifications',
      name: 'Build Notifications',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2620, positions.row2],
    },
    {
      parameters: execWorkflowParams(workflowIds.sendWhatsApp),
      id: 'order-send-notifications',
      name: 'Send WhatsApp Notifications',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [2920, positions.row2],
    },
  ],
  connections: {
    'When Executed by Another Workflow': {
      main: [[{ node: 'Check Message Idempotency', type: 'main', index: 0 }]],
    },
    'Check Message Idempotency': {
      main: [[{ node: 'Build Order Code', type: 'main', index: 0 }]],
    },
    'Build Order Code': {
      main: [[{ node: 'Route Order Action', type: 'main', index: 0 }]],
    },
    'Route Order Action': {
      main: [
        [],
        [{ node: 'Insert Order', type: 'main', index: 0 }],
      ],
    },
    'Insert Order': {
      main: [[{ node: 'Prepare Sheets Mirror', type: 'main', index: 0 }]],
    },
    'Prepare Sheets Mirror': {
      main: [[{ node: 'Route Sheets Mirror', type: 'main', index: 0 }]],
    },
    'Route Sheets Mirror': {
      main: [
        [{ node: 'Append Google Sheets Mirror', type: 'main', index: 0 }],
        [{ node: 'Select Active Rider', type: 'main', index: 0 }],
      ],
    },
    'Append Google Sheets Mirror': {
      main: [[{ node: 'Select Active Rider', type: 'main', index: 0 }]],
    },
    'Select Active Rider': {
      main: [[{ node: 'Build Notifications', type: 'main', index: 0 }]],
    },
    'Build Notifications': {
      main: [[{ node: 'Send WhatsApp Notifications', type: 'main', index: 0 }]],
    },
  },
  settings: {
    executionOrder: 'v1',
  },
  staticData: null,
  pinData: {},
  meta: {
    templateCredsSetupCompleted: false,
  },
  tags: [],
};

const riderWorkflow = {
  id: workflowIds.riderUpdate,
  name: 'rider-update',
  active: false,
  nodes: [
    {
      parameters: {
        inputSource: 'passthrough',
      },
      id: 'rider-trigger',
      name: 'When Executed by Another Workflow',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      position: [positions.col1, positions.row2],
    },
    {
      parameters: code(`
const item = $input.first().json;
const raw = String(item.message_text || '').trim();
const upper = raw.toUpperCase();
const parts = upper.split(/\\s+/).filter(Boolean);
if (!upper.startsWith('ENTREGADO')) {
  return [{ json: { ...item, route: 'invalid', reply_text: 'Formato incorrecto. Usa: ENTREGADO {order_code} {payment_type}', action_taken: 'rider_input_invalid' } }];
}
if (!parts[1]) {
  return [{ json: { ...item, route: 'invalid', reply_text: 'Formato incorrecto. Usa: ENTREGADO {order_code}', action_taken: 'rider_input_missing_code' } }];
}
const paymentType = raw.split(/\\s+/).slice(2).join(' ').trim();
return [{
  json: {
    ...item,
    route: 'lookup',
    order_code: parts[1],
    payment_type_candidate: paymentType ? paymentType.toLowerCase() : '',
    action_taken: 'rider_lookup_order',
  },
}];
      `),
      id: 'rider-parse',
      name: 'Parse Rider Message',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [positions.col2, positions.row2],
    },
    {
      parameters: {
        mode: 'rules',
        dataType: 'string',
        value1: '={{ $json.route }}',
        rules: {
          rules: [
            switchRule('invalid', 'invalid'),
            switchRule('lookup', 'lookup'),
          ],
        },
      },
      id: 'rider-route',
      name: 'Route Rider Action',
      type: 'n8n-nodes-base.switch',
      typeVersion: 2,
      position: [positions.col3, positions.row2],
    },
    {
      parameters: setManualFields([
        setField('to', '={{ $json.phone }}'),
        setField('body', '={{ $json.reply_text }}'),
        setField('phone', '={{ $json.phone }}'),
        setField('message_id', '={{ $json.message_id }}'),
        setField('action_taken', '={{ $json.action_taken }}'),
      ]),
      id: 'rider-build-invalid-reply',
      name: 'Build Invalid Rider Reply',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.1,
      position: [positions.col4, positions.row1],
    },
    {
      parameters: execWorkflowParams(workflowIds.sendWhatsApp),
      id: 'rider-send-invalid-reply',
      name: 'Send Invalid Rider Reply',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [positions.col5, positions.row1],
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: "SELECT $1::text AS order_code, $2::text AS phone, $3::text AS message_id, $4::text AS payment_type_candidate, o.id, o.customer_phone, o.payment_type, o.status FROM (SELECT 1) seed LEFT JOIN orders o ON o.order_code = $1;",
        options: {
          queryReplacement: '={{ [$json.order_code, $json.phone, $json.message_id, $json.payment_type_candidate] }}',
        },
      },
      id: 'rider-find-order',
      name: 'Find Order By Code',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [positions.col4, positions.row3],
      credentials: postgresCredential,
    },
    {
      parameters: code(`
const row = $input.first().json;
if (!row.id) {
  return [{ json: { ...row, route: 'not_found', reply_text: 'Código no encontrado', action_taken: 'rider_order_code_not_found' } }];
}
return [{
  json: {
    ...row,
    route: 'update',
    final_payment_type: row.payment_type_candidate || row.payment_type || '',
    action_taken: 'rider_update_order',
  },
}];
      `),
      id: 'rider-decide-order',
      name: 'Decide Rider Update',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [positions.col5, positions.row3],
    },
    {
      parameters: {
        mode: 'rules',
        dataType: 'string',
        value1: '={{ $json.route }}',
        rules: {
          rules: [
            switchRule('not_found', 'not_found'),
            switchRule('update', 'update'),
          ],
        },
      },
      id: 'rider-route-found',
      name: 'Route Order Match',
      type: 'n8n-nodes-base.switch',
      typeVersion: 2,
      position: [positions.col6, positions.row3],
    },
    {
      parameters: setManualFields([
        setField('to', '={{ $json.phone }}'),
        setField('body', '={{ $json.reply_text }}'),
        setField('phone', '={{ $json.phone }}'),
        setField('message_id', '={{ $json.message_id }}'),
        setField('action_taken', '={{ $json.action_taken }}'),
      ]),
      id: 'rider-build-not-found',
      name: 'Build Not Found Reply',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.1,
      position: [positions.col7, positions.row2],
    },
    {
      parameters: execWorkflowParams(workflowIds.sendWhatsApp),
      id: 'rider-send-not-found',
      name: 'Send Not Found Reply',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [positions.col7, positions.row1],
    },
    {
      parameters: {
        operation: 'executeQuery',
        query: "WITH updated AS (UPDATE orders SET status = 'delivered', delivered_at = NOW(), updated_at = NOW(), payment_type = COALESCE(NULLIF($2, ''), payment_type), rider_phone = COALESCE(NULLIF($3, ''), rider_phone) WHERE order_code = $1 RETURNING order_code, customer_phone, payment_type, rider_phone) SELECT updated.order_code, updated.customer_phone, updated.payment_type, updated.rider_phone, $4::text AS message_id FROM updated;",
        options: {
          queryReplacement: '={{ [$json.order_code, $json.final_payment_type, $json.phone, $json.message_id] }}',
        },
      },
      id: 'rider-update-order',
      name: 'Mark Order Delivered',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [positions.col7, positions.row4],
      credentials: postgresCredential,
    },
    {
      parameters: code(`
const row = $input.first().json;
return [
  { json: { to: row.customer_phone, phone: row.customer_phone, message_id: row.message_id, action_taken: 'notify_customer_order_delivered', body: \`Tu pedido \${row.order_code} fue entregado\` } },
  { json: { to: row.rider_phone, phone: row.rider_phone, message_id: row.message_id, action_taken: 'notify_rider_delivery_recorded', body: 'Entrega registrada correctamente' } },
];
      `),
      id: 'rider-build-success',
      name: 'Build Delivery Notifications',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2020, positions.row4],
    },
    {
      parameters: execWorkflowParams(workflowIds.sendWhatsApp),
      id: 'rider-send-success',
      name: 'Send Delivery Notifications',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [2320, positions.row4],
    },
  ],
  connections: {
    'When Executed by Another Workflow': {
      main: [[{ node: 'Parse Rider Message', type: 'main', index: 0 }]],
    },
    'Parse Rider Message': {
      main: [[{ node: 'Route Rider Action', type: 'main', index: 0 }]],
    },
    'Route Rider Action': {
      main: [
        [{ node: 'Build Invalid Rider Reply', type: 'main', index: 0 }],
        [{ node: 'Find Order By Code', type: 'main', index: 0 }],
      ],
    },
    'Build Invalid Rider Reply': {
      main: [[{ node: 'Send Invalid Rider Reply', type: 'main', index: 0 }]],
    },
    'Find Order By Code': {
      main: [[{ node: 'Decide Rider Update', type: 'main', index: 0 }]],
    },
    'Decide Rider Update': {
      main: [[{ node: 'Route Order Match', type: 'main', index: 0 }]],
    },
    'Route Order Match': {
      main: [
        [{ node: 'Build Not Found Reply', type: 'main', index: 0 }],
        [{ node: 'Mark Order Delivered', type: 'main', index: 0 }],
      ],
    },
    'Build Not Found Reply': {
      main: [[{ node: 'Send Not Found Reply', type: 'main', index: 0 }]],
    },
    'Mark Order Delivered': {
      main: [[{ node: 'Build Delivery Notifications', type: 'main', index: 0 }]],
    },
    'Build Delivery Notifications': {
      main: [[{ node: 'Send Delivery Notifications', type: 'main', index: 0 }]],
    },
  },
  settings: {
    executionOrder: 'v1',
  },
  staticData: null,
  pinData: {},
  meta: {
    templateCredsSetupCompleted: false,
  },
  tags: [],
};

const sendWhatsAppWorkflow = {
  id: workflowIds.sendWhatsApp,
  name: 'send-whatsapp-message',
  active: false,
  nodes: [
    {
      parameters: {
        inputSource: 'passthrough',
      },
      id: 'send-trigger',
      name: 'When Executed by Another Workflow',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      position: [positions.col1, positions.row2],
    },
    {
      parameters: code(`
const item = $input.first().json;
if (!item.to || !item.body) {
  return [{ json: { ...item, route: 'skip', reason: 'missing_payload', to: item.to || '', body: item.body || '', action_taken: item.action_taken || 'skip_missing_payload' } }];
}
return [{ json: { ...item, route: 'dispatch', to: item.to, body: item.body } }];
      `),
      id: 'send-decide-mode',
      name: 'Decide Delivery Mode',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [positions.col2, positions.row2],
    },
    {
      parameters: {
        mode: 'rules',
        dataType: 'string',
        value1: '={{ $json.route === "skip" ? "skip" : "mock" }}',
        rules: {
          rules: [
            switchRule('mock', 'mock'),
            switchRule('live', 'live'),
            switchRule('skip', 'skip'),
          ],
        },
      },
      id: 'send-route',
      name: 'Route Delivery Mode',
      type: 'n8n-nodes-base.switch',
      typeVersion: 2,
      position: [positions.col3, positions.row2],
    },
    {
      parameters: setManualFields([
        setField('status', 'mock'),
        setField('to', '={{ $json.to }}'),
        setField('body', '={{ $json.body }}'),
        setField('phone', '={{ $json.phone || $json.to || "" }}'),
        setField('message_id', '={{ $json.message_id || "" }}'),
        setField('action_taken', '={{ $json.action_taken || "mock_whatsapp_delivery" }}'),
      ]),
      id: 'send-mock',
      name: 'Mock WhatsApp Delivery',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.1,
      position: [positions.col4, positions.row1],
    },
    {
      parameters: {
        method: 'POST',
        url: '={{ ($env.WHATSAPP_GRAPH_BASE_URL || "https://placeholder.invalid/whatsapp") + "/" + $json.phone_number_id + "/messages" }}',
        authentication: 'none',
        sendHeaders: true,
        specifyHeaders: 'keypair',
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '={{ "Bearer " + $env.WHATSAPP_ACCESS_TOKEN }}',
            },
            {
              name: 'Content-Type',
              value: 'application/json',
            },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ ({ messaging_product: "whatsapp", to: $json.to, type: "text", text: { body: $json.body } }) }}',
        options: {},
      },
      id: 'send-live-http',
      name: 'Send WhatsApp API Request',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.4,
      position: [positions.col4, positions.row2],
      onError: 'continueRegularOutput',
    },
    {
      parameters: setManualFields([
        setField('status', 'skipped'),
        setField('reason', '={{ $json.reason || "missing_payload" }}'),
        setField('phone', '={{ $json.phone || $json.to || "" }}'),
        setField('message_id', '={{ $json.message_id || "" }}'),
        setField('action_taken', '={{ $json.action_taken || "skip_missing_payload" }}'),
      ]),
      id: 'send-skip',
      name: 'Skip Invalid Delivery',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.1,
      position: [positions.col4, positions.row3],
    },
  ],
  connections: {
    'When Executed by Another Workflow': {
      main: [[{ node: 'Decide Delivery Mode', type: 'main', index: 0 }]],
    },
    'Decide Delivery Mode': {
      main: [[{ node: 'Route Delivery Mode', type: 'main', index: 0 }]],
    },
    'Route Delivery Mode': {
      main: [
        [{ node: 'Mock WhatsApp Delivery', type: 'main', index: 0 }],
        [{ node: 'Send WhatsApp API Request', type: 'main', index: 0 }],
        [{ node: 'Skip Invalid Delivery', type: 'main', index: 0 }],
      ],
    },
  },
  settings: {
    executionOrder: 'v1',
  },
  staticData: null,
  pinData: {},
  meta: {
    templateCredsSetupCompleted: false,
  },
  tags: [],
};

const workflows = [
  routerWorkflow,
  conversationWorkflow,
  orderCreateWorkflow,
  riderWorkflow,
  sendWhatsAppWorkflow,
];

const outputPaths = [
  resolve('workflows/MVP_Workflow.local.json'),
  resolve('workflows/MVP_Final.exported.json'),
];

for (const outputPath of outputPaths) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(workflows, null, 2)}\n`);
}
