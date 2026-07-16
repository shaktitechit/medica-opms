/**
 * Additional OpenAPI paths/schemas aligned with routes mounted in src/app.js
 * but not yet inlined in swagger.js.
 * @module docs/swaggerExtended
 */

const SOFT_DELETE_RBAC = 'RBAC: wildcard `*` or `records:delete`.';

const stdResponses = {
  getOne: {
    '200': { $ref: '#/components/responses/SuccessObject' },
    '401': { $ref: '#/components/responses/Unauthorized' },
    '403': { $ref: '#/components/responses/Forbidden' },
    '404': { $ref: '#/components/responses/NotFound' },
  },
  getList: {
    '200': { $ref: '#/components/responses/SuccessArray' },
    '401': { $ref: '#/components/responses/Unauthorized' },
    '403': { $ref: '#/components/responses/Forbidden' },
  },
  mutate: {
    '200': { $ref: '#/components/responses/SuccessObject' },
    '201': { $ref: '#/components/responses/SuccessObject' },
    '400': { $ref: '#/components/responses/BadRequest' },
    '401': { $ref: '#/components/responses/Unauthorized' },
    '403': { $ref: '#/components/responses/Forbidden' },
    '404': { $ref: '#/components/responses/NotFound' },
  },
};

const idPath = [{ $ref: '#/components/parameters/IdPath' }];

const extendedTags = [
  { name: 'order-approvals', description: 'Finance/account release batches (`/api/order-approvals`)' },
  { name: 'order-deliveries', description: 'Delivery execution records' },
  { name: 'order-returns', description: 'Warehouse return records' },
  { name: 'order-due-sheets', description: 'Order due sheet documents (file management + Attachment ref)' },
  { name: 'final-order-statements', description: 'Computed statement for closed orders' },
  { name: 'party-products', description: 'Party–product mappings and rates' },
  { name: 'party-order-products-rate', description: 'Check/map rates for order lines' },
  { name: 'transport-agents', description: 'Third-party transport agents' },
  { name: 'messages', description: 'Outbound messaging queue + webhooks' },
  { name: 'reminders', description: 'Follow-up reminders (incl. Google Sheet webhook)' },
  { name: 'files', description: 'File management presigned view/download redirects' },
];

const extendedPaths = {
  '/api/orders/{id}/fulfillment': {
    get: {
      tags: ['orders'],
      summary: 'Order fulfillment snapshot',
      description: 'Aggregated line quantities, dispatch/delivery/return totals. Permission: `orders:read` or `*`.',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.getOne,
    },
  },
  '/api/orders/{id}/assignees': {
    get: {
      tags: ['orders'],
      summary: 'Workflow assignees for order',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.getList,
    },
  },
  '/api/orders/{id}/close': {
    post: {
      tags: ['orders'],
      summary: 'Close order',
      description:
        'Marks the order status as closed and workflow stage as completed without changing quantities, approvals, returns, or commercial totals.',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { remarks: { type: 'string' } },
            },
          },
        },
      },
      responses: stdResponses.mutate,
    },
  },
  '/api/orders/{id}/close-after-full-delivery': {
    post: {
      tags: ['orders'],
      summary: 'Close order after full delivery',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object', properties: { remarks: { type: 'string' } } },
          },
        },
      },
      responses: stdResponses.mutate,
    },
  },

  '/api/order-approvals': {
    get: {
      tags: ['order-approvals'],
      summary: 'List order approvals',
      parameters: [
        { name: 'order', in: 'query', schema: { type: 'string' } },
        { name: 'is_finance_approved', in: 'query', schema: { type: 'boolean' } },
        { name: 'assigned_finance_user', in: 'query', schema: { type: 'string' } },
      ],
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getList,
    },
    post: {
      tags: ['order-approvals'],
      summary: 'Create order approval release',
      description: 'Department: **admin**, **super_admin**, or **finance**.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
      },
      responses: { ...stdResponses.mutate, '201': stdResponses.mutate['201'] },
    },
  },
  '/api/order-approvals/deleted': {
    get: {
      tags: ['order-approvals'],
      summary: 'List deleted order approvals',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getList,
    },
  },
  '/api/order-approvals/{id}': {
    get: {
      tags: ['order-approvals'],
      summary: 'Get order approval',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.getOne,
    },
    patch: {
      tags: ['order-approvals'],
      summary: 'Patch order approval',
      description: 'Department: **admin**, **super_admin**, or **finance**.',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: stdResponses.mutate,
    },
    delete: {
      tags: ['order-approvals'],
      summary: 'Soft-delete order approval',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },
  '/api/order-approvals/{id}/restore': {
    post: {
      tags: ['order-approvals'],
      summary: 'Restore order approval',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },
  '/api/order-approvals/{id}/approve': {
    post: {
      tags: ['order-approvals'],
      summary: 'Approve release',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: stdResponses.mutate,
    },
  },
  '/api/order-approvals/{id}/reject': {
    post: {
      tags: ['order-approvals'],
      summary: 'Reject release',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: stdResponses.mutate,
    },
  },
  '/api/order-approvals/{id}/send-to-finance': {
    post: {
      tags: ['order-approvals'],
      summary: 'Send release to finance',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },
  '/api/order-approvals/{id}/send-to-account': {
    post: {
      tags: ['order-approvals'],
      summary: 'Send release to account',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },
  '/api/order-approvals/{id}/finance-amend': {
    post: {
      tags: ['order-approvals'],
      summary: 'Finance amend release',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: stdResponses.mutate,
    },
  },
  '/api/order-approvals/{id}/amend': {
    post: {
      tags: ['order-approvals'],
      summary: 'Account amend release',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: stdResponses.mutate,
    },
  },
  '/api/order-approvals/{id}/resolve-dispatch': {
    post: {
      tags: ['order-approvals'],
      summary: 'Resolve release dispatch/returns (account)',
      description: 'Net-settles release against dispatch quantities and warehouse returns.',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: stdResponses.mutate,
    },
  },

  '/api/order-deliveries': {
    get: {
      tags: ['order-deliveries'],
      summary: 'List deliveries',
      parameters: [
        { name: 'order', in: 'query', schema: { type: 'string' } },
        { name: 'dispatch', in: 'query', schema: { type: 'string' } },
        { name: 'delivery_status', in: 'query', schema: { type: 'string' } },
      ],
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getList,
    },
  },
  '/api/order-deliveries/log-shipment': {
    post: {
      tags: ['order-deliveries'],
      summary: 'Log full shipment delivery',
      description:
        'Creates a full delivery record. Every dispatched product and quantity must be included; partial delivery and return lines are rejected.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['order', 'dispatch', 'transport', 'delivery_type', 'delivery_items'],
              properties: {
                order: { type: 'string' },
                dispatch: { type: 'string' },
                transport: { type: 'string' },
                delivery_type: { type: 'string', enum: ['full'] },
                delivery_items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['product', 'delivered_quantity'],
                    properties: {
                      product: { type: 'string' },
                      delivered_quantity: { type: 'number', minimum: 0 },
                      remarks: { type: 'string' },
                    },
                  },
                },
                received_by: { type: 'string' },
                remarks: { type: 'string' },
              },
            },
          },
        },
      },
      responses: stdResponses.mutate,
    },
  },
  '/api/order-deliveries/deleted': {
    get: {
      tags: ['order-deliveries'],
      summary: 'List deleted deliveries',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getList,
    },
  },
  '/api/order-deliveries/{id}': {
    get: {
      tags: ['order-deliveries'],
      summary: 'Get delivery',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.getOne,
    },
    patch: {
      tags: ['order-deliveries'],
      summary: 'Patch delivery',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: stdResponses.mutate,
    },
    delete: {
      tags: ['order-deliveries'],
      summary: 'Soft-delete delivery',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },
  '/api/order-deliveries/{id}/restore': {
    post: {
      tags: ['order-deliveries'],
      summary: 'Restore delivery',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },

  '/api/order-returns': {
    get: {
      tags: ['order-returns'],
      summary: 'List returns',
      parameters: [
        { name: 'order', in: 'query', schema: { type: 'string' } },
        { name: 'dispatch', in: 'query', schema: { type: 'string' } },
        { name: 'return_status', in: 'query', schema: { type: 'string', enum: ['pending', 'received_at_warehouse'] } },
      ],
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getList,
    },
    post: {
      tags: ['order-returns'],
      summary: 'Create return record',
      security: [{ bearerAuth: [] }],
      requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderReturnCreate' } } } },
      responses: stdResponses.mutate,
    },
  },
  '/api/order-returns/deleted': {
    get: {
      tags: ['order-returns'],
      summary: 'List deleted returns',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getList,
    },
  },
  '/api/order-returns/{id}': {
    get: {
      tags: ['order-returns'],
      summary: 'Get return',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.getOne,
    },
    patch: {
      tags: ['order-returns'],
      summary: 'Patch return',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: stdResponses.mutate,
    },
    delete: {
      tags: ['order-returns'],
      summary: 'Soft-delete return',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },
  '/api/order-returns/{id}/restore': {
    post: {
      tags: ['order-returns'],
      summary: 'Restore return',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },

  '/api/order-due-sheets': {
    get: {
      tags: ['order-due-sheets'],
      summary: 'List due sheets',
      parameters: [
        { name: 'order', in: 'query', schema: { type: 'string' } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'superseded', 'archived'] } },
        { name: 'is_current', in: 'query', schema: { type: 'boolean' } },
      ],
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getList,
    },
    post: {
      tags: ['order-due-sheets'],
      summary: 'Upload due sheet',
      description: 'Multipart: `document` file + fields `order`, optional `remarks`, `sheet_date`. Write: admin/finance/account/super_admin.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['order', 'document'],
              properties: {
                order: { type: 'string' },
                document: { type: 'string', format: 'binary', description: 'Due sheet file upload' },
                remarks: { type: 'string' },
                sheet_date: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      responses: stdResponses.mutate,
    },
  },
  '/api/order-due-sheets/deleted': {
    get: {
      tags: ['order-due-sheets'],
      summary: 'List deleted due sheets',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getList,
    },
  },
  '/api/order-due-sheets/order/{orderId}/current': {
    get: {
      tags: ['order-due-sheets'],
      summary: 'Current due sheet for order',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: stdResponses.getOne,
    },
  },
  '/api/order-due-sheets/{id}': {
    get: {
      tags: ['order-due-sheets'],
      summary: 'Get due sheet',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.getOne,
    },
    patch: {
      tags: ['order-due-sheets'],
      summary: 'Patch due sheet metadata',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
      responses: stdResponses.mutate,
    },
    delete: {
      tags: ['order-due-sheets'],
      summary: 'Soft-delete due sheet',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },
  '/api/order-due-sheets/{id}/document': {
    post: {
      tags: ['order-due-sheets'],
      summary: 'Replace due sheet document file',
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['document'],
              properties: { document: { type: 'string', format: 'binary' } },
            },
          },
        },
      },
      responses: stdResponses.mutate,
    },
  },
  '/api/order-due-sheets/{id}/restore': {
    post: {
      tags: ['order-due-sheets'],
      summary: 'Restore due sheet',
      description: SOFT_DELETE_RBAC,
      security: [{ bearerAuth: [] }],
      parameters: idPath,
      responses: stdResponses.mutate,
    },
  },

  '/api/final-order-statements': {
    get: {
      tags: ['final-order-statements'],
      summary: 'List final statements index',
      parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getList,
    },
  },
  '/api/final-order-statements/order/{orderId}': {
    get: {
      tags: ['final-order-statements'],
      summary: 'Generate final statement for closed order',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: stdResponses.getOne,
    },
  },

  '/api/party-products': {
    get: { tags: ['party-products'], summary: 'List party-product mappings', security: [{ bearerAuth: [] }], responses: stdResponses.getList },
    post: { tags: ['party-products'], summary: 'Create mapping', security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: stdResponses.mutate },
  },
  '/api/party-products/deleted': {
    get: { tags: ['party-products'], summary: 'List deleted mappings', security: [{ bearerAuth: [] }], responses: stdResponses.getList },
  },
  '/api/party-products/{id}': {
    get: { tags: ['party-products'], summary: 'Get mapping', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.getOne },
    patch: { tags: ['party-products'], summary: 'Update mapping', security: [{ bearerAuth: [] }], parameters: idPath, requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: stdResponses.mutate },
    delete: { tags: ['party-products'], summary: 'Soft-delete mapping', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.mutate },
  },
  '/api/party-products/{id}/restore': {
    post: { tags: ['party-products'], summary: 'Restore mapping', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.mutate },
  },
  '/api/party-products/{id}/rates': {
    post: { tags: ['party-products'], summary: 'Add rate to mapping', security: [{ bearerAuth: [] }], parameters: idPath, requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: stdResponses.mutate },
  },
  '/api/party-products/rates/{rateId}': {
    patch: { tags: ['party-products'], summary: 'Update rate', security: [{ bearerAuth: [] }], parameters: [{ name: 'rateId', in: 'path', required: true, schema: { type: 'string' } }], responses: stdResponses.mutate },
    delete: { tags: ['party-products'], summary: 'Delete rate', security: [{ bearerAuth: [] }], parameters: [{ name: 'rateId', in: 'path', required: true, schema: { type: 'string' } }], responses: stdResponses.mutate },
  },
  '/api/party-products/rates/{rateId}/approve': {
    post: { tags: ['party-products'], summary: 'Approve rate', security: [{ bearerAuth: [] }], parameters: [{ name: 'rateId', in: 'path', required: true, schema: { type: 'string' } }], responses: stdResponses.mutate },
  },

  '/api/party-order-products-rate/check/{orderId}': {
    get: { tags: ['party-order-products-rate'], summary: 'Check order line rates', security: [{ bearerAuth: [] }], parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }], responses: stdResponses.getOne },
  },
  '/api/party-order-products-rate/check-lines': {
    post: { tags: ['party-order-products-rate'], summary: 'Check specific order lines', security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: stdResponses.mutate },
  },
  '/api/party-order-products-rate/map': {
    post: { tags: ['party-order-products-rate'], summary: 'Map rate to order line', security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: stdResponses.mutate },
  },

  '/api/transport-agents': {
    get: { tags: ['transport-agents'], summary: 'List transport agents', security: [{ bearerAuth: [] }], responses: stdResponses.getList },
    post: { tags: ['transport-agents'], summary: 'Create transport agent', security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: stdResponses.mutate },
  },
  '/api/transport-agents/deleted': {
    get: { tags: ['transport-agents'], summary: 'List deleted agents', security: [{ bearerAuth: [] }], responses: stdResponses.getList },
  },
  '/api/transport-agents/{id}': {
    get: { tags: ['transport-agents'], summary: 'Get transport agent', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.getOne },
    patch: { tags: ['transport-agents'], summary: 'Patch transport agent', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.mutate },
    delete: { tags: ['transport-agents'], summary: 'Soft-delete agent', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.mutate },
  },
  '/api/transport-agents/{id}/restore': {
    post: { tags: ['transport-agents'], summary: 'Restore agent', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.mutate },
  },

  '/api/messages/webhook': {
    get: { tags: ['messages'], summary: 'Verify messaging webhook', security: [], responses: { '200': { description: 'Challenge response' } } },
    post: { tags: ['messages'], summary: 'Receive messaging webhook', security: [], responses: { '200': { description: 'Acknowledged' } } },
  },
  '/api/messages': {
    get: { tags: ['messages'], summary: 'List messages', security: [{ bearerAuth: [] }], responses: stdResponses.getList },
  },
  '/api/messages/send': {
    post: { tags: ['messages'], summary: 'Queue outbound message', security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: stdResponses.mutate },
  },
  '/api/messages/{id}': {
    get: { tags: ['messages'], summary: 'Get message', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.getOne },
  },

  '/api/reminders/google-sheet-webhook': {
    post: { tags: ['reminders'], summary: 'Google Sheet sync webhook', security: [], responses: stdResponses.mutate },
  },
  '/api/reminders': {
    get: { tags: ['reminders'], summary: 'List reminders', security: [{ bearerAuth: [] }], responses: stdResponses.getList },
    post: { tags: ['reminders'], summary: 'Create reminder', security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: stdResponses.mutate },
  },
  '/api/reminders/{id}': {
    get: { tags: ['reminders'], summary: 'Get reminder', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.getOne },
    patch: { tags: ['reminders'], summary: 'Patch reminder', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.mutate },
    delete: { tags: ['reminders'], summary: 'Delete reminder', security: [{ bearerAuth: [] }], parameters: idPath, responses: stdResponses.mutate },
  },
  '/api/reminders/{id}/follow-ups': {
    post: { tags: ['reminders'], summary: 'Add follow-up', security: [{ bearerAuth: [] }], parameters: idPath, requestBody: { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } }, responses: stdResponses.mutate },
  },

  '/api/files/{fileId}/view': {
    get: {
      tags: ['files'],
      summary: 'Redirect to file view URL',
      description: 'Returns redirect to presigned MinIO view URL. Used by Attachment/Dispatch/DueSheet stored URLs.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { '302': { description: 'Redirect to presigned URL' }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } },
    },
  },
  '/api/files/{fileId}/download': {
    get: {
      tags: ['files'],
      summary: 'Redirect to file download URL',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { '302': { description: 'Redirect to presigned URL' }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } },
    },
  },

  '/api/dashboard/account': {
    get: {
      tags: ['dashboard'],
      summary: 'Account dashboard',
      description: 'Department: **account** only.',
      security: [{ bearerAuth: [] }],
      responses: stdResponses.getOne,
    },
  },
};

const extendedSchemas = {
  OrderReturnCreate: {
    type: 'object',
    required: ['order', 'return_items'],
    properties: {
      order: { type: 'string' },
      dispatch: { type: 'string' },
      transport: { type: 'string' },
      delivery: { type: 'string' },
      return_status: { type: 'string', enum: ['pending', 'received_at_warehouse'] },
      return_items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['product', 'returned_quantity'],
          properties: {
            product: { type: 'string' },
            returned_quantity: { type: 'number', minimum: 1 },
            return_reason: { type: 'string' },
            remarks: { type: 'string' },
          },
        },
      },
      remarks: { type: 'string' },
    },
  },
  OrderDueSheet: {
    type: 'object',
    properties: {
      _id: { type: 'string' },
      due_sheet_no: { type: 'string' },
      order: { type: 'string' },
      document: { type: 'string', description: 'Attachment ObjectId' },
      sheet_date: { type: 'string', format: 'date-time' },
      revision_number: { type: 'number' },
      is_current: { type: 'boolean' },
      status: { type: 'string', enum: ['active', 'superseded', 'archived'] },
      remarks: { type: 'string' },
    },
  },
};

module.exports = { extendedTags, extendedPaths, extendedSchemas };
