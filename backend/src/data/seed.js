/**
 * @fileoverview Data/seeding (seed).
 * @module data/seed
 */
/** Permission definitions — source of truth for `mongoSyncUsers` role wiring. */

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
];

module.exports = {
  PERMISSION_DEFS,
  /** Used by Swagger / onboarding copy */
  get demoCredentials() {
    return {
      email: 'sales@medica.example',
      password: process.env.SEED_PASSWORD || 'ChangeMe123!',
      adminEmail: 'admin@medica.example',
    };
  },
};
