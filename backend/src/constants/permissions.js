/**
 * Permission definitions and codes seeded in MongoDB.
 */
const PERMISSION_DEFS = [
  { code: '*', module: 'user', description: 'Full access' },
  {
    code: 'records:delete',
    module: 'system',
    description: 'Allows soft-delete / restore; users with wildcard `*` can do these actions without this code.',
  },
  { code: 'users:manage', module: 'user', description: 'Manage users & roles catalog' },
  { code: 'parties:manage', module: 'party', description: 'Parties (customers & suppliers)' },
  { code: 'products:manage', module: 'product', description: 'Products' },
  { code: 'orders:read', module: 'order', description: 'View orders' },
  { code: 'orders:write', module: 'order', description: 'Create/update draft orders' },
  { code: 'finance:suite', module: 'finance', description: 'Finance approvals & invoicing' },
  { code: 'dispatch:suite', module: 'dispatch', description: 'Dispatch planning & execution' },
  { code: 'transport:suite', module: 'transport', description: 'Transport & POD' },
  { code: 'flags:suite', module: 'flag', description: 'Flags lifecycle' },
  { code: 'dashboard:view', module: 'dashboard', description: 'Department dashboards' },
  { code: 'work_planner:suite', module: 'work_planner', description: 'Work planner plans & visits' },
  {
    code: 'transport_planner:suite',
    module: 'transport_planner',
    description: 'Transport planner plans & dispatch execution',
  },
  { code: 'leads:read', module: 'lead', description: 'View leads' },
  { code: 'leads:write', module: 'lead', description: 'Create and update leads' },
  { code: 'leads:manage', module: 'lead', description: 'Manage lead assignments and masters' },
  { code: 'leads:assign', module: 'lead', description: 'Assign and reassign leads' },
  { code: 'leads:delete', module: 'lead', description: 'Delete leads' },
];

const PERMISSION_CODES = Object.freeze(PERMISSION_DEFS.map((p) => p.code));

module.exports = { PERMISSION_DEFS, PERMISSION_CODES };
