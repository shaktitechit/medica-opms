module.exports = {
  draft: ['submitted', 'cancelled'],

  submitted: ['sales_approved', 'finance_review', 'on_hold', 'cancelled'],

  sales_approved: ['finance_review', 'on_hold', 'cancelled'],

  finance_review: ['partially_finance_approved', 'fully_finance_approved', 'finance_rejected', 'on_hold', 'dispatch_pending', 'cancelled'],

  finance_rejected: ['submitted', 'cancelled'],

  finance_approved: ['dispatch_pending', 'on_hold', 'finance_rejected'],

  partially_finance_approved: ['account_review', 'dispatch_pending', 'on_hold', 'finance_rejected', 'finance_review', 'partially_finance_approved', 'fully_finance_approved', 'cancelled'],

  fully_finance_approved: ['account_review', 'dispatch_pending', 'on_hold', 'finance_rejected', 'finance_review', 'cancelled'],

  account_review: ['partially_account_approved', 'fully_account_approved', 'account_rejected', 'on_hold', 'cancelled'],

  partially_account_approved: ['dispatch_pending', 'account_review', 'account_rejected', 'on_hold', 'cancelled'],

  fully_account_approved: ['dispatch_pending', 'account_review', 'account_rejected', 'on_hold', 'cancelled'],

  account_rejected: ['account_review', 'fully_finance_approved', 'partially_finance_approved', 'cancelled'],

  dispatch_pending: ['partial_dispatch_created', 'full_dispatch_created', 'on_hold', 'cancelled'],

  partial_dispatch_created: [
    'partial_dispatch_created',
    'full_dispatch_created',
    'transport_pending',
    'partially_transported',
    'fully_transported',
    'on_hold',
    'dispatch_pending',
    'cancelled'
  ],

  full_dispatch_created: [
    'transport_pending',
    'partially_transported',
    'fully_transported',
    'on_hold',
    'partial_dispatch_created',
    'dispatch_pending',
    'cancelled'
  ],

  transport_pending: [
    'transport_assigned',
    'partially_transported',
    'fully_transported',
    'on_hold',
    'full_dispatch_created',
    'partial_dispatch_created',
    'dispatch_pending',
    'cancelled'
  ],

  transport_assigned: [
    'in_transit',
    'on_hold',
    'transport_pending',
    'partially_transported',
    'fully_transported',
    'full_dispatch_created',
    'partial_dispatch_created',
    'dispatch_pending',
    'cancelled'
  ],

  partially_transported: [
    'transport_assigned',
    'transport_pending',
    'in_transit',
    'on_hold',
    'full_dispatch_created',
    'partial_dispatch_created',
    'dispatch_pending',
    'cancelled',
    'fully_transported'
  ],

  fully_transported: [
    'transport_assigned',
    'transport_pending',
    'in_transit',
    'on_hold',
    'full_dispatch_created',
    'partial_dispatch_created',
    'dispatch_pending',
    'cancelled',
    'partially_transported'
  ],

  in_transit: [
    'delivered',
    'on_hold',
    'transport_assigned',
    'partially_transported',
    'fully_transported',
    'full_dispatch_created',
    'partial_dispatch_created',
    'dispatch_pending',
    'cancelled'
  ],

  delivered: [
    'in_transit',
    'transport_assigned',
    'partially_transported',
    'fully_transported',
    'full_dispatch_created',
    'partial_dispatch_created',
    'dispatch_pending',
    'cancelled'
  ],

  /**
   * Basic resume paths.
   * Better long-term: store hold_from_status on order and resume only to that status.
   */
  on_hold: [
    'submitted',
    'sales_approved',
    'finance_review',
    'partially_finance_approved',
    'fully_finance_approved',
    'account_review',
    'partially_account_approved',
    'fully_account_approved',
    'dispatch_pending',
    'transport_pending',
    'transport_assigned',
    'partially_transported',
    'fully_transported',
    'in_transit',
    'cancelled',
  ],
};