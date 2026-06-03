/**
 * @fileoverview Fixture user payloads consumed by mongoSyncUsers.
 * @module data/exampleUserSeeder
 */
const CORE_USERS = [
  { name: 'Super Admin', email: 'superadmin@medica.example', phone: '+91000000000', department: 'super_admin', roleCode: 'super_admin' },
  { name: 'System Admin', email: 'admin@medica.example', phone: '+91000000001', department: 'admin', roleCode: 'admin' },
  { name: 'Sales User', email: 'sales@medica.example', phone: '+91000000002', department: 'sales', roleCode: 'sales' },
  { name: 'Finance User', email: 'finance@medica.example', phone: '+91000000003', department: 'finance', roleCode: 'finance' },
  { name: 'Dispatch User', email: 'dispatch@medica.example', phone: '+91000000004', department: 'dispatch', roleCode: 'dispatch' },
];

const EXTRA_EXAMPLE_USERS = [
  { name: 'Maya Rao — Sales Executive', email: 'maya.sales@medica.example', phone: '+919811010101', department: 'sales', roleCode: 'sales' },
  { name: 'Amit Verma — Finance Analyst', email: 'amit.finance@medica.example', phone: '+919811010102', department: 'finance', roleCode: 'finance' },
  { name: 'Neha Singh — Dispatch Coordinator', email: 'neha.dispatch@medica.example', phone: '+919811010103', department: 'dispatch', roleCode: 'dispatch' },
  { name: 'Karim Ahmed — Fleet Lead', email: 'karim.dispatch@medica.example', phone: '+919811010104', department: 'dispatch', roleCode: 'dispatch' },
  { name: 'Sandbox Admin', email: 'sandbox.admin@medica.example', phone: '+919811010106', department: 'admin', roleCode: 'admin' },
];

module.exports = { CORE_USERS, EXTRA_EXAMPLE_USERS };
