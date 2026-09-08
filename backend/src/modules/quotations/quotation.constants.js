/**
 * @fileoverview Quotation module constants.
 * @module modules/quotations/quotation.constants
 */

const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

// Roles authorized to view/read quotations
const QUOTATION_ROLES = ['sales', 'admin', 'super_admin', 'finance'];

// Roles authorized to create, edit, approve, or delete quotations
const QUOTATION_ADMIN_ROLES = ['admin', 'super_admin', 'finance'];

module.exports = {
  QUOTATION_STATUSES,
  QUOTATION_ROLES,
  QUOTATION_ADMIN_ROLES,
};
