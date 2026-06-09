/**
 * @fileoverview OpenAPI 3.1 document for Swagger UI against this codebase.
 * Mirrors routes mounted in src/app.js and handlers under src/modules/*.
 * Default PORT comes from src/config/env.js (commonly 5000).
 */
const ORDER_STATUS_VALUES = [
  'draft',
  'submitted',
  'sales_approved',
  'finance_review',
  'finance_approved',
  'finance_rejected',
  'dispatch_pending',
  'partial_dispatch_created',
  'full_dispatch_created',
  'transport_pending',
  'transport_assigned',
  'partially_transported',
  'fully_transported',
  'in_transit',
  'delivered',
  'invoice_generated',
  'collection_pending',
  'partially_paid',
  'paid',
  'closed',
  'cancelled',
  'on_hold',
];

const FLAG_TYPES = [
  'urgent',
  'payment_issue',
  'dispatch_issue',
  'stock_issue',
  'customer_issue',
  'document_missing',
  'approval_delay',
  'vehicle_issue',
  'pod_missing',
  'invoice_mismatch',
  'customer_dispute',
];

/** Reused in soft-delete / restore / trash-list operation descriptions */
const SOFT_DELETE_RBAC = 'RBAC: wildcard `*` or `records:delete`.';

/** @type {Record<string, unknown>} */
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Medica Backend API',
    version: '1.0.0',
    description: [
      'REST API for order workflow, approvals, finance, dispatch, logistics (transport records), fleet, and notifications.',
      'Domain data is persisted in **MongoDB** via Mongoose models in `src/data/mongoRegistry.js`; set `MONGO_URI` / `MONGODB_URI` before starting the server.',
      '',
      '**Auth:** `POST /api/auth/login` returns a JWT. Send `Authorization: Bearer <token>` on protected routes.',
      '**Dept rules:** Many routes additionally require `user.department` (or `admin`) — see each operation description.',
      '**RBAC:** Most routes combine permission codes with OR semantics (`orders:read` **or** `*`).',
      '**RBAC:** Soft-delete and restore endpoints accept **either** wildcard `*` **or** `records:delete`. Add `records:delete` to a role (or use `*`) and run `npm run seed:users` after catalog changes.',
    ].join('\n'),
  },
  servers: [
    { url: 'http://localhost:5000', description: 'Local (default PORT from env)' },
    { url: '/', description: 'Relative (same host as deployed service)' },
  ],
  tags: [
    { name: 'health', description: 'Liveness' },
    { name: 'auth', description: 'JWT session' },
    { name: 'users', description: 'Requires `users:manage` or `*`; admin roster' },
    { name: 'parties', description: 'Parties (customers, suppliers); `parties:manage`' },
    { name: 'products' },
    { name: 'orders', description: 'Workflow + commercials; RBAC + department checks in handlers' },
    { name: 'approvals', description: 'Requires `orders:read`, `finance:suite`, or `*`' },
    { name: 'finance', description: 'Department: finance or admin' },
    { name: 'payments' },
    { name: 'invoices' },
    { name: 'dispatch', description: 'Department: dispatch or admin' },
    { name: 'transport', description: 'Logistics / POD resources (department: dispatch or admin)' },
    { name: 'collections', description: 'Collections AR records (finance or admin) — endpoints may not be mounted' },
    { name: 'flags', description: 'Requires `flags:suite` or `*`' },
    { name: 'dashboard', description: 'Department-scoped summaries' },
    { name: 'notifications' },
    { name: 'activity', description: 'Requires `dashboard:view`, `users:manage`, or `*`' },
    { name: 'attachments', description: 'Soft-delete/restore: `*` or `records:delete`' },
    { name: 'vehicles', description: 'Department: dispatch or admin' },
    { name: 'drivers', description: 'Department: dispatch or admin' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['health'],
        summary: 'API index (non-SPA root)',
        description: 'Returns pointers to `/health` and example `/api/*` paths.',
        security: [],
        responses: {
          '200': {
            description: 'Service metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    service: { type: 'string' },
                    message: { type: 'string' },
                    health: { type: 'string' },
                    examples: { type: 'object', additionalProperties: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/health': {
      get: {
        tags: ['health'],
        summary: 'Health check',
        security: [],
        responses: {
          '200': {
            description: 'Service is up',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean', const: true } },
                },
              },
            },
          },
        },
      },
    },

    '/api/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Login (JWT)',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'token + sanitized user payload',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginSuccess' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['auth'],
        summary: 'Current session user',
        description: 'Requires valid Bearer JWT; user resolved from memory and/or Mongo when enabled.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'User profile + permissionCodes',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserMeSuccess' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/users/roles': {
      get: {
        tags: ['users'],
        summary: 'List roles',
        description: 'Permission: `users:manage` or `*`.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/users/permissions': {
      get: {
        tags: ['users'],
        summary: 'List permissions catalog',
        description: 'Permission: `users:manage` or `*`.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/users': {
      get: {
        tags: ['users'],
        summary: 'List active users',
        description: 'Permission: `users:manage` or `*`.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['users'],
        summary: 'Create user',
        description: 'Permission: `users:manage` or `*`. Duplicate email → 409.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': { description: 'Email already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } } },
        },
      },
    },
    '/api/users/{id}': {
      get: {
        tags: ['users'],
        summary: 'Get user by id',
        description: 'Permission: `users:manage` or `*`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['users'],
        summary: 'Update user',
        description:
          'Partial update. Permission: `users:manage` or `*`. Omitted password → unchanged; new email duplicate → 409.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserUpdate' },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'Email already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } } },
        },
      },
    },

    '/api/parties': {
      get: {
        tags: ['parties'],
        summary: 'List parties',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['parties'],
        summary: 'Create party',
        description: 'Permission: `parties:manage` or `*`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PartyCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/parties/deleted': {
      get: {
        tags: ['parties'],
        summary: 'List soft-deleted parties',
        description: 'Returns rows with `deletedAt` set, newest first. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/parties/{id}': {
      get: {
        tags: ['parties'],
        summary: 'Get party',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['parties'],
        summary: 'Update party',
        description: 'Permission: `parties:manage` or `*`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: true,
                description: 'Partial Party fields',
              },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['parties'],
        summary: 'Soft-delete party',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/parties/{id}/restore': {
      post: {
        tags: ['parties'],
        summary: 'Restore party',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/products': {
      get: {
        tags: ['products'],
        summary: 'List products',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['products'],
        summary: 'Create product',
        description: 'Permission: `products:manage` or `*`.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProductCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/products/deleted': {
      get: {
        tags: ['products'],
        summary: 'List soft-deleted products',
        description: 'Returns rows with `deletedAt` set, newest first. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/products/{id}': {
      get: {
        tags: ['products'],
        summary: 'Get product',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['products'],
        summary: 'Update product',
        description: 'Permission: `products:manage` or `*`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['products'],
        summary: 'Soft-delete product',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/products/{id}/restore': {
      post: {
        tags: ['products'],
        summary: 'Restore product',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/orders': {
      get: {
        tags: ['orders'],
        summary: 'List orders',
        description: 'Permission: `orders:read` or `*`. Query filters optional.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ORDER_STATUS_VALUES } },
          { name: 'party', in: 'query', schema: { type: 'string', description: 'Party id (OPMS hospital / distributor)' } },
        ],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['orders'],
        summary: 'Create draft order',
        description: 'Requires `orders:write` or `*`; only **sales** or **admin** may create.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OrderCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/orders/deleted': {
      get: {
        tags: ['orders'],
        summary: 'List soft-deleted orders',
        description:
          'Trash list (`deletedAt` set). Same optional filters as active list (`status`, `party`). ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ORDER_STATUS_VALUES } },
          { name: 'party', in: 'query', schema: { type: 'string', description: 'Party id' } },
        ],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/orders/{id}': {
      get: {
        tags: ['orders'],
        summary: 'Get order',
        description: 'Permission: `orders:read` or `*`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['orders'],
        summary: 'Update order (partials)',
        description:
          'Department + workflow rules enforced (commercials, line items, party). See `order.policy` + `workflow` services.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OrderPatch' },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['orders'],
        summary: 'Soft-delete order',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/orders/{id}/restore': {
      post: {
        tags: ['orders'],
        summary: 'Restore order',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/orders/{id}/history': {
      get: {
        tags: ['orders'],
        summary: 'Workflow / status history for order',
        description: 'Permission: `orders:read` or `*`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/orders/{id}/approvals': {
      get: {
        tags: ['orders'],
        summary: 'Approval rows for order',
        description: 'Permission: `orders:read` or `*`.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/orders/{id}/transition': {
      post: {
        tags: ['orders'],
        summary: 'Workflow transition',
        description: 'Runs `workflowService.transitionOrderStatus` — permissions and allowed transitions enforced in services.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OrderTransition' },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/approvals': {
      get: {
        tags: ['approvals'],
        summary: 'List order approvals',
        description: 'Requires token with `orders:read`, `finance:suite`, or `*`. Optional `order` query id.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/finance/queue': {
      get: {
        tags: ['finance'],
        summary: 'Finance workflow queue snapshot',
        description: 'Department: **finance** or **admin**.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },
    '/api/finance/summary': {
      get: {
        tags: ['finance'],
        summary: 'Finance KPI summary',
        description: 'Department: **finance** or **admin**.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },

    '/api/payments': {
      get: {
        tags: ['payments'],
        summary: 'List payments',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'order', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', example: 'submitted' } },
        ],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['payments'],
        summary: 'Submit payment',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaymentCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/payments/deleted': {
      get: {
        tags: ['payments'],
        summary: 'List soft-deleted payments',
        description: 'Trash list; optional filters `order`, `status` (same as active list). ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'order', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/payments/{id}': {
      get: {
        tags: ['payments'],
        summary: 'Get payment',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['payments'],
        summary: 'Soft-delete payment',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/payments/{id}/restore': {
      post: {
        tags: ['payments'],
        summary: 'Restore payment',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/payments/{id}/finance': {
      patch: {
        tags: ['payments'],
        summary: 'Finance verify or reject payment',
        description: 'Department: **finance** or **admin**.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaymentFinanceAction' },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/invoices': {
      get: {
        tags: ['invoices'],
        summary: 'List invoices',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/invoices/deleted': {
      get: {
        tags: ['invoices'],
        summary: 'List soft-deleted invoices',
        description: 'Optional filter `order`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/invoices/{id}': {
      get: {
        tags: ['invoices'],
        summary: 'Get invoice',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['invoices'],
        summary: 'Patch invoice',
        description: 'Collection users cannot alter financial totals (blocked in service).',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['invoices'],
        summary: 'Soft-delete invoice',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/invoices/{id}/restore': {
      post: {
        tags: ['invoices'],
        summary: 'Restore invoice',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/dispatch': {
      get: {
        tags: ['dispatch'],
        summary: 'List dispatches',
        description: 'Department: **dispatch** or **admin**.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
      post: {
        tags: ['dispatch'],
        summary: 'Create dispatch',
        description: 'Department: **dispatch** or **admin**. Requires `items[]` with line quantities.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DispatchCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/dispatch/deleted': {
      get: {
        tags: ['dispatch'],
        summary: 'List soft-deleted dispatches',
        description: 'Trash list; optional `order` filter. Dept: **dispatch** or **admin**. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/dispatch/{id}': {
      get: {
        tags: ['dispatch'],
        summary: 'Get dispatch',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['dispatch'],
        summary: 'Update dispatch',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['dispatch'],
        summary: 'Soft-delete dispatch',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/dispatch/{id}/restore': {
      post: {
        tags: ['dispatch'],
        summary: 'Restore dispatch',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/transport': {
      get: {
        tags: ['transport'],
        summary: 'List transports',
        description: 'Department: **dispatch** or **admin**.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
      post: {
        tags: ['transport'],
        summary: 'Create transport',
        description: 'Department: **dispatch** or **admin**.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TransportCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/transport/deleted': {
      get: {
        tags: ['transport'],
        summary: 'List soft-deleted transports',
        description: 'Trash list; optional `order`. Dept: **dispatch** or **admin**. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/transport/{id}': {
      get: {
        tags: ['transport'],
        summary: 'Get transport',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['transport'],
        summary: 'Update transport',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['transport'],
        summary: 'Soft-delete transport',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/transport/{id}/restore': {
      post: {
        tags: ['transport'],
        summary: 'Restore transport',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/collections': {
      get: {
        tags: ['collections'],
        summary: 'List collections',
        description: 'Department: **finance** or **admin**.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },

    '/api/collections/deleted': {
      get: {
        tags: ['collections'],
        summary: 'List soft-deleted collection records',
        description: 'Trash list; optional `order` filter. Dept: **finance** or **admin**. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/collections/mark-overdue': {
      post: {
        tags: ['collections'],
        summary: 'Mark overdue (by collection ids)',
        description: 'Department: **finance** or **admin**.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ids: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },
    '/api/collections/{id}': {
      get: {
        tags: ['collections'],
        summary: 'Get collection record',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['collections'],
        summary: 'Patch collection',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['collections'],
        summary: 'Soft-delete collection record',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/collections/{id}/restore': {
      post: {
        tags: ['collections'],
        summary: 'Restore collection record',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/collections/{id}/followups': {
      post: {
        tags: ['collections'],
        summary: 'Append follow-up',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['note'],
                properties: {
                  note: { type: 'string' },
                  next_followup_date: { type: 'string', format: 'date-time', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/flags': {
      get: {
        tags: ['flags'],
        summary: 'List order flags',
        description: 'Permission: `flags:suite` or `*`. Filter by `order` id.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'order', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['flags'],
        summary: 'Raise flag',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FlagCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/api/flags/{id}': {
      get: {
        tags: ['flags'],
        summary: 'Get flag',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['flags'],
        summary: 'Patch flag',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/dashboard/admin': {
      get: {
        tags: ['dashboard'],
        summary: 'Admin overview',
        description: 'Department: **admin** only.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },
    '/api/dashboard/sales': {
      get: {
        tags: ['dashboard'],
        summary: 'Sales dashboard slice',
        description: 'Department: **sales** only.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },
    '/api/dashboard/finance': {
      get: {
        tags: ['dashboard'],
        summary: 'Finance dashboard',
        description: 'Department: **finance** only.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },
    '/api/dashboard/dispatch': {
      get: {
        tags: ['dashboard'],
        summary: 'Dispatch dashboard',
        description:
          'Department: **dispatch** only. Includes inbound dispatch counts plus logistics KPIs (`transport_arranged`, `in_transit`, `awaiting_pod`).',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },

    '/api/dashboard/super': {
      get: {
        tags: ['dashboard'],
        summary: 'Super-admin dashboard',
        description:
          'Department: **super_admin** only. Returns a combined cross-department overview: users, orders (by status), finance queue, dispatch pending, fleet counts, and open flags.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },

    '/api/notifications': {
      get: {
        tags: ['notifications'],
        summary: 'List notifications for current user',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'unread',
            in: 'query',
            schema: { type: 'string', enum: ['1', 'true', 'false', '0'] },
            description: 'If `1` or `true`, only unread',
          },
        ],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/notifications/{id}/read': {
      patch: {
        tags: ['notifications'],
        summary: 'Mark notification read',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/activity': {
      get: {
        tags: ['activity'],
        summary: 'Activity log',
        description: 'Requires `dashboard:view`, `users:manage`, or `*`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'entity_type', in: 'query', schema: { type: 'string' } },
          { name: 'entity_id', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/attachments': {
      get: {
        tags: ['attachments'],
        summary: 'List attachments',
        description:
          'Returns only active attachments (`deletedAt` is null). Soft-deleted rows are omitted by Mongoose soft-delete middleware.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'entity_type', in: 'query', schema: { type: 'string' } },
          { name: 'entity_id', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['attachments'],
        summary: 'Register attachment metadata',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AttachmentCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    '/api/attachments/deleted': {
      get: {
        tags: ['attachments'],
        summary: 'List soft-deleted attachments',
        description: 'Same optional filters as active list. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'entity_type', in: 'query', schema: { type: 'string' } },
          { name: 'entity_id', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/attachments/{id}': {
      get: {
        tags: ['attachments'],
        summary: 'Get attachment',
        description: 'Returns 404 if the attachment is soft-deleted.',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['attachments'],
        summary: 'Soft-delete attachment',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/attachments/{id}/restore': {
      post: {
        tags: ['attachments'],
        summary: 'Restore soft-deleted attachment',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/vehicles': {
      get: {
        tags: ['vehicles'],
        summary: 'List vehicles',
        description: 'Department: **dispatch** or **admin**.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
      post: {
        tags: ['vehicles'],
        summary: 'Create vehicle',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VehicleCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },

    '/api/vehicles/deleted': {
      get: {
        tags: ['vehicles'],
        summary: 'List soft-deleted vehicles',
        description: 'Dept: **dispatch** or **admin**. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/vehicles/{id}': {
      get: {
        tags: ['vehicles'],
        summary: 'Get vehicle',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['vehicles'],
        summary: 'Update vehicle',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['vehicles'],
        summary: 'Soft-delete vehicle',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/vehicles/{id}/restore': {
      post: {
        tags: ['vehicles'],
        summary: 'Restore vehicle',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/drivers': {
      get: {
        tags: ['drivers'],
        summary: 'List drivers',
        description: 'Department: **dispatch** or **admin**.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
      post: {
        tags: ['drivers'],
        summary: 'Create driver',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DriverCreate' },
            },
          },
        },
        responses: {
          '201': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
        },
      },
    },

    '/api/drivers/deleted': {
      get: {
        tags: ['drivers'],
        summary: 'List soft-deleted drivers',
        description: 'Dept: **dispatch** or **admin**. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessArray' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    '/api/drivers/{id}': {
      get: {
        tags: ['drivers'],
        summary: 'Get driver',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['drivers'],
        summary: 'Update driver',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: true },
            },
          },
        },
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/ForbiddenDept' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['drivers'],
        summary: 'Soft-delete driver',
        description: 'Sets `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    '/api/drivers/{id}/restore': {
      post: {
        tags: ['drivers'],
        summary: 'Restore driver',
        description: 'Clears `deletedAt`. ' + SOFT_DELETE_RBAC,
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/IdPath' }],
        responses: {
          '200': { $ref: '#/components/responses/SuccessObject' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'From POST /api/auth/login → token' },
    },
    parameters: {
      IdPath: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
    },
    responses: {
      SuccessObject: {
        description: 'Wrapped entity',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/EnvelopeObject' },
          },
        },
      },
      SuccessArray: {
        description: 'Wrapped list',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/EnvelopeArray' },
          },
        },
      },
      BadRequest: {
        description: 'Validation / bad input',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorBody' },
          },
        },
      },
      Unauthorized: {
        description: 'Missing JWT, invalid token, or unknown user',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorBody' },
          },
        },
      },
      Forbidden: {
        description: 'Insufficient permission codes',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorBody' },
          },
        },
      },
      ForbiddenDept: {
        description: 'Wrong department for this route (or not admin)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorBody' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorBody' },
          },
        },
      },
    },
    schemas: {
      ErrorBody: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              details: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
      EnvelopeObject: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: true },
          data: { description: 'Resource payload', type: 'object', additionalProperties: true },
        },
      },
      EnvelopeArray: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: true },
          data: { type: 'array', items: {} },
        },
      },
      LoginSuccess: {
        allOf: [
          { $ref: '#/components/schemas/EnvelopeObject' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  token: { type: 'string' },
                  user: {
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' },
                      department: { type: 'string' },
                      roles: { type: 'array', items: { type: 'string' } },
                      permissionCodes: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      UserMeSuccess: {
        allOf: [
          { $ref: '#/components/schemas/EnvelopeObject' },
          {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                  permissionCodes: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        ],
      },

      OrderLineInput: {
        type: 'object',
        properties: {
          _id: { type: 'string', description: 'Optional line id' },
          product: { type: 'string' },
          product_name: { type: 'string' },
          sku: { type: 'string' },
          brand: { type: 'string' },
          manufacturer: { type: 'string' },
          product_group: { type: 'string' },
          product_subgroup: { type: 'string' },
          unit: { type: 'string' },
          gst_percent: { type: 'number', default: 0 },
          quantity: { type: 'number' },
          free_qty: { type: 'number', description: 'Bonus quantity (OPMS)' },
          dispatched_quantity: { type: 'number' },
          pending_dispatch_quantity: { type: 'number' },
          unit_price: { type: 'number' },
          applied_rate_type: { type: 'string', enum: ['SR', 'SRA', 'CR', 'MANUAL'] },
          pricing_reference: { type: 'string', description: 'PartyProductRate ObjectId' },
          pricing_validity_start: { type: 'string', format: 'date-time', nullable: true },
          pricing_validity_end: { type: 'string', format: 'date-time', nullable: true },
          manual_price_override: { type: 'boolean' },
          approval_required: { type: 'boolean' },
          approved_by: { type: 'string', description: 'User ObjectId' },
          approved_at: { type: 'string', format: 'date-time', nullable: true },
          approval_remarks: { type: 'string' },
          discount_amount: { type: 'number' },
          discount_percent: { type: 'number', description: 'Line discount %; recalculates discount_amount server-side' },
          taxable_amount: { type: 'number' },
          gst_amount: { type: 'number' },
          total_amount: { type: 'number' },
          line_status: { type: 'string', enum: ['draft', 'confirmed', 'partially_dispatched', 'fully_dispatched', 'cancelled'] },
          remarks: { type: 'string' },
        },
      },
      OrderCreate: {
        type: 'object',
        required: ['party', 'order_items'],
        properties: {
          party: { type: 'string', description: 'Party id (required counterparty)' },
          order_date: { type: 'string', format: 'date-time', description: 'Defaults to now' },
          payment_status: { type: 'string', enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
          notes: { type: 'string', description: 'Operational notes' },
          order_items: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/OrderLineInput' } },
          discount_amount: { type: 'number' },
          priority: { type: 'string' },
          expected_delivery_date: { type: 'string', format: 'date-time', nullable: true },
          assigned_sales_user: { type: 'string' },
          remarks: { type: 'string' },
        },
      },
      OrderPatch: {
        type: 'object',
        additionalProperties: false,
        description:
          'Only these fields are accepted; any other key (including `status`, `$set`, operators) returns 400. Lifecycle: `POST /api/orders/{id}/transition`.',
        properties: {
          party: { type: 'string', nullable: true },
          order_date: { type: 'string', format: 'date-time' },
          payment_status: { type: 'string', enum: ['unpaid', 'partial', 'paid'] },
          notes: { type: 'string' },
          order_items: { type: 'array', items: { $ref: '#/components/schemas/OrderLineInput' } },
          discount_amount: { type: 'number' },
          priority: { type: 'string' },
          expected_delivery_date: { type: 'string', format: 'date-time', nullable: true },
          remarks: { type: 'string' },
          assigned_sales_user: { type: 'string' },
          assigned_finance_user: { type: 'string' },
          assigned_dispatch_user: { type: 'string' },
          assigned_admin_user: { type: 'string' },
        },
      },
      OrderTransition: {
        type: 'object',
        required: ['next_status'],
        properties: {
          next_status: { type: 'string', enum: ORDER_STATUS_VALUES },
          remarks: { type: 'string' },
          rejection_reason: { type: 'string' },
          paid_amount: { type: 'number', description: 'When transition requires payment capture' },
        },
      },

      UserCreate: {
        type: 'object',
        required: ['name', 'email', 'password', 'department'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
          department: {
            type: 'string',
            description: 'One of super_admin, admin, sales, finance, dispatch',
            enum: ['super_admin', 'admin', 'sales', 'finance', 'dispatch'],
          },
          phone: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
          is_active: { type: 'boolean' },
        },
      },
      UserUpdate: {
        type: 'object',
        description:
          'At least one property required. Omit password to leave unchanged; empty password string is ignored.',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
          department: {
            type: 'string',
            enum: ['super_admin', 'admin', 'sales', 'finance', 'dispatch'],
          },
          phone: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
          is_active: { type: 'boolean' },
        },
      },
      PartyCreate: {
        type: 'object',
        required: ['party_name', 'mobile'],
        properties: {
          party_type: { type: 'string', enum: ['customer', 'supplier', 'both'], default: 'customer' },
          party_name: { type: 'string' },
          contact_person: { type: 'string' },
          mobile: { type: 'string' },
          email: { type: 'string' },
          gst_no: { type: 'string' },
          drug_license_no: { type: 'string' },
          district: { type: 'string' },
          state: { type: 'string' },
          payment_terms: { type: 'string' },
          billing_address: {
            type: 'object',
            additionalProperties: true,
          },
          shipping_address: {
            type: 'object',
            additionalProperties: true,
          },
          legacy_customer: { type: 'string', description: 'Optional link when migrating from Customer docs' },
          is_active: { type: 'boolean' },
        },
      },
      ProductCreate: {
        type: 'object',
        required: ['product_name', 'default_price'],
        properties: {
          product_name: { type: 'string' },
          generic_name: { type: 'string' },
          default_price: { type: 'number' },
          base_price: { type: 'number', description: 'Alias for default_price (deprecated)' },
          sku: { type: 'string' },
          hsn_code: { type: 'string' },
          category: { type: 'string' },
          category_id: { type: 'string' },
          brand_id: { type: 'string' },
          manufacturer_id: { type: 'string' },
          unit: {
            type: 'string',
            enum: ['pcs', 'box', 'kg', 'ltr', 'meter', 'set', 'kit', 'bottle'],
          },
          gst_percent: { type: 'number' },
          gst_rate: { type: 'number', description: 'Alias for default_gst_rate' },
          default_gst_rate: { type: 'number' },
          requires_batch: { type: 'boolean' },
          requires_expiry: { type: 'boolean' },
          requires_serial: { type: 'boolean' },
          mrp: { type: 'number' },
          default_sale_rate: { type: 'number' },
          minimum_sale_rate: { type: 'number' },
          warranty_months: { type: 'integer', minimum: 0 },
          description: { type: 'string' },
          is_active: { type: 'boolean' },
        },
      },
      PaymentCreate: {
        type: 'object',
        required: ['order', 'amount', 'payment_mode'],
        properties: {
          order: { type: 'string' },
          customer: { type: 'string', description: 'Optional; defaults from order' },
          amount: { type: 'number' },
          payment_mode: { type: 'string' },
          transaction_id: { type: 'string' },
          cheque_no: { type: 'string' },
          bank_name: { type: 'string' },
          payment_date: { type: 'string', format: 'date-time' },
        },
      },
      PaymentFinanceAction: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['verify', 'reject'] },
          rejection_reason: { type: 'string', description: 'Required when action is reject' },
        },
      },

      DispatchLine: {
        type: 'object',
        required: ['order_item_id', 'dispatch_quantity'],
        properties: {
          order_item_id: { type: 'string' },
          dispatch_quantity: { type: 'number', minimum: 0 },
        },
      },
      DispatchCreate: {
        type: 'object',
        required: ['order', 'items'],
        properties: {
          order: { type: 'string' },
          items: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/DispatchLine' } },
          dispatch_date: { type: 'string', format: 'date-time' },
          status: { type: 'string' },
          warehouse_location: { type: 'string' },
          remarks: { type: 'string' },
        },
      },
      TransportCreate: {
        type: 'object',
        required: ['order', 'dispatch'],
        properties: {
          order: { type: 'string' },
          dispatch: { type: 'string' },
          vehicle: { type: 'string' },
          driver: { type: 'string' },
          vehicle_no: { type: 'string' },
          driver_name: { type: 'string' },
          driver_phone: { type: 'string' },
          transporter_type: { type: 'string' },
          transporter_name: { type: 'string' },
          transporter_phone: { type: 'string' },
          source_location: { type: 'string' },
          destination_location: { type: 'string' },
          route_details: { type: 'string' },
          dispatch_date: { type: 'string', format: 'date-time' },
          expected_delivery_date: { type: 'string', format: 'date-time' },
          actual_delivery_date: { type: 'string', format: 'date-time' },
          status: { type: 'string' },
          proof_of_delivery: {},
          remarks: { type: 'string' },
          failure_reason: { type: 'string' },
        },
      },

      FlagCreate: {
        type: 'object',
        required: ['order', 'flag_type', 'title'],
        properties: {
          order: { type: 'string' },
          flag_type: { type: 'string', enum: FLAG_TYPES },
          title: { type: 'string' },
          description: { type: 'string' },
          severity: { type: 'string' },
          blocks_order: { type: 'boolean' },
        },
      },

      AttachmentCreate: {
        type: 'object',
        required: ['entity_type', 'entity_id'],
        properties: {
          entity_type: { type: 'string' },
          entity_id: { type: 'string' },
          original_name: { type: 'string' },
          file_name: { type: 'string' },
          mime_type: { type: 'string' },
          size: { type: 'number' },
          storage_provider: { type: 'string' },
          bucket: { type: 'string' },
          key: { type: 'string' },
          url: { type: 'string' },
        },
      },

      Attachment: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          original_name: { type: 'string' },
          file_name: { type: 'string' },
          mime_type: { type: 'string' },
          size: { type: 'number' },
          storage_provider: { type: 'string' },
          entity_type: { type: 'string' },
          entity_id: { type: 'string' },
          uploaded_by: { type: 'string' },
          deletedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'When set, the attachment is soft-deleted; omitted from normal list/get.',
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      VehicleCreate: {
        type: 'object',
        properties: {
          vehicle_no: { type: 'string' },
          vehicle_type: { type: 'string' },
          capacity: { type: 'string' },
          ownership_type: { type: 'string' },
          status: { type: 'string' },
          insurance_expiry: { type: 'string', format: 'date-time', nullable: true },
          fitness_expiry: { type: 'string', format: 'date-time', nullable: true },
          pollution_expiry: { type: 'string', format: 'date-time', nullable: true },
          is_active: { type: 'boolean' },
        },
      },
      DriverCreate: {
        type: 'object',
        required: ['name', 'phone'],
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          license_no: { type: 'string' },
          license_expiry: { type: 'string', format: 'date-time', nullable: true },
          assigned_vehicle: { type: 'string', nullable: true },
          status: { type: 'string' },
          is_active: { type: 'boolean' },
        },
      },
    },
  },
};

module.exports = { spec, ORDER_STATUS_VALUES, FLAG_TYPES };
