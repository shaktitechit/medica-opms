
/**
 * @fileoverview Core commercial order document.
 * Stores current commercial state and per-line fulfillment quantities.
 */

import mongoose from "mongoose";

/* =========================================================
 * ENUMS (canonical values for this model)
 * ======================================================= */

const ORDER_LINE_STATUS = ["active", "fulfilled", "cancelled"];

const ORDER_LIFECYCLE_STATUS = [
  "draft",
  "active",
  "fulfilled",
  "cancelled",
  "on_hold",
];

const ORDER_WORKFLOW_STAGE = [
  "sales",
  "admin_review",
  "finance_review",
  "account_review",
  "dispatch",
  "completed",
  "cancelled",
  "on_hold",
];

/** High-level workflow queue (replaces granular transport/dispatch sub-states). */
const ORDER_STATUS = [
  "draft",
  "submitted",
  "sales_approved",
  "finance_review",
  "finance_approved",
  "finance_rejected",
  "account_review",
  "account_approved",
  "account_rejected",
  "dispatch",
  "in_transit",
  "delivered",
  "cancelled",
  "on_hold",
];

const APPROVAL_STATUS = ["pending", "approved", "rejected", "full"];

const FULFILLMENT_STATUS = ["pending", "completed"];

/* =========================================================
 * ORDER ITEM
 * ======================================================= */

const orderItemSchema = new mongoose.Schema(
  {
    /* ----- Product snapshot ----- */

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    product_name: {
      type: String,
      required: true,
      trim: true,
    },

    sku: String,
    brand: String,
    manufacturer: String,
    product_group: String,
    product_subgroup: String,
    unit: String,
    hsn_code: String,

    gst_percent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    /* ----- Fulfillment quantities (single source per line) ----- */

    ordered_quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    approved_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    dispatched_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    delivered_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    returned_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    /** Derived line state from quantities above. */
    line_status: {
      type: String,
      enum: ORDER_LINE_STATUS,
      default: "active",
      index: true,
    },

    free_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* ----- Pricing ----- */

    unit_price: {
      type: Number,
      required: true,
      min: 0,
    },

    applied_rate_type: {
      type: String,
      enum: ["SR", "SRA", "CR", "MANUAL"],
      default: "MANUAL",
    },

    pricing_reference: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartyProductRate",
    },

    pricing_validity_start: Date,
    pricing_validity_end: Date,

    manual_price_override: {
      type: Boolean,
      default: false,
    },

    /* ----- Line approval metadata ----- */

    approval_required: {
      type: Boolean,
      default: false,
    },

    approval_reason: String,

    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approved_at: Date,

    /* ----- Discount & tax ----- */

    discount_percent: {
      type: Number,
      default: 0,
    },

    discount_amount: {
      type: Number,
      default: 0,
    },

    taxable_amount: {
      type: Number,
      default: 0,
    },

    gst_amount: {
      type: Number,
      default: 0,
    },

    total_amount: {
      type: Number,
      default: 0,
    },

    /**
     * When set, this line is a kit bucket individual expanded from a kit product.
     * Commercial price should be 0; qty is derived from kit qty × percentage.
     */
    kit_parent_product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },

    remarks: String,
  },
  {
    _id: true,
    timestamps: true,
  },
);

/* =========================================================
 * ORDER
 * ======================================================= */

const orderSchema = new mongoose.Schema(
  {
    /* ----- Basic ----- */

    order_no: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    order_date: {
      type: Date,
      default: Date.now,
      index: true,
    },

    expected_delivery_date: Date,

    /**
     * Derived from expected_delivery_date on save / API read:
     * >10 days → low, 5–10 → normal, 3–4 → high, ≤2 / past → urgent.
     */
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true,
    },

    /* ----- Party ----- */

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },

    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      index: true,
    },

    /* ----- Status (three layers) -----
     * lifecycle_status — business outcome (draft → active → partially_fulfilled → fulfilled)
     * workflow_stage   — owning department / pipeline stage
     * status           — workflow queue position (terminal state: closed)
     *
     * Account close sets:
     *   workflow_stage   = completed
     *   status           = closed
     *   closed_at        = timestamp
     * --------------------------------------------------- */

    lifecycle_status: {
      type: String,
      enum: ORDER_LIFECYCLE_STATUS,
      default: "draft",
      index: true,
    },

    workflow_stage: {
      type: String,
      enum: ORDER_WORKFLOW_STAGE,
      default: "sales",
      index: true,
    },

    status: {
      type: String,
      enum: ORDER_STATUS,
      default: "draft",
      index: true,
    },

    current_action: {
      type: String,
      default: "drafted",
      index: true,
    },

    current_revision: {
      type: Number,
      default: 1,
    },

    is_locked: {
      type: Boolean,
      default: false,
    },

    /* ----- Ownership ----- */

    current_assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    /** Sales owner — only department that filters order lists by assignee. */
    assigned_sales_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    current_department: {
      type: String,
      enum: ["super_admin", "sales", "admin", "finance", "account", "dispatch"],
      index: true,
    },

    pending_with_role: {
      type: String,
      enum: ["super_admin", "sales", "admin", "finance", "account", "dispatch"],
      index: true,
    },

    /* ----- Financials ----- */

    subtotal: {
      type: Number,
      default: 0,
    },

    discount_amount: {
      type: Number,
      default: 0,
    },

    taxable_amount: {
      type: Number,
      default: 0,
    },

    gst_amount: {
      type: Number,
      default: 0,
    },

    grand_total: {
      type: Number,
      default: 0,
    },

    extra_charges: {
      type: Number,
      default: 0,
      min: 0,
    },

    penalty_amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    damage_charge: {
      type: Number,
      default: 0,
      min: 0,
    },

    closed_at: Date,

    closed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    closure_remarks: String,

    payment_status: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
      index: true,
    },

    billing_status: {
      type: String,
      enum: ["unbilled", "fully_billed"],
      default: "unbilled",
      index: true,
    },

    billing_date: {
      type: Date,
      index: true,
    },


    /* ----- Department approvals (same enum shape) ----- */

    finance_approval_status: {
      type: String,
      enum: APPROVAL_STATUS,
      default: "pending",
      index: true,
    },

    last_finance_approval: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderApproval",
      index: true,
    },

    admin_approval_status: {
      type: String,
      enum: APPROVAL_STATUS,
      default: "pending",
      index: true,
    },

    last_admin_approval: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderApproval",
      index: true,
    },

    account_approval_status: {
      type: String,
      enum: APPROVAL_STATUS,
      default: "pending",
      index: true,
    },

    last_account_approval: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderApproval",
      index: true,
    },

    /* ----- Execution rollup (same enum shape) ----- */

    allocation_status: {
      type: String,
      enum: FULFILLMENT_STATUS,
      default: "pending",
    },

    dispatch_status: {
      type: String,
      enum: FULFILLMENT_STATUS,
      default: "pending",
    },

    delivery_status: {
      type: String,
      enum: FULFILLMENT_STATUS,
      default: "pending",
    },

    /* ----- Lines ----- */

    order_items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: "Order must contain at least one item.",
      },
    },

    /* ----- Flags ----- */

    has_open_flags: {
      type: Boolean,
      default: false,
      index: true,
    },

    open_flag_count: {
      type: Number,
      default: 0,
    },

    highest_flag_severity: {
      type: String,
      enum: ["none", "low", "medium", "high", "critical"],
      default: "none",
    },

    /* ----- Remarks ----- */

    remarks: String,
    internal_notes: String,

    /* ----- Audit ----- */

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

/* =========================================================
 * INDEXES
 * ======================================================= */

orderSchema.index({ customer: 1, order_date: -1 });
orderSchema.index({ workflow_stage: 1, lifecycle_status: 1 });
orderSchema.index({ current_assignee: 1, workflow_stage: 1 });
orderSchema.index({ status: 1, closed_at: -1 });
orderSchema.index({ status: 1, workflow_stage: 1, createdAt: -1 });
orderSchema.index({ party: 1, createdAt: -1 });
orderSchema.index({ order_date: -1 });
orderSchema.index({ order_no: 1 });
orderSchema.index({ order_number: 1 });

orderSchema.pre("save", function (next) {
  const doc = this;
  if (doc.isModified("status") || doc.isNew) {
    const status = String(doc.status);
    switch (status) {
      case "draft":
        doc.lifecycle_status = "draft";
        doc.workflow_stage = "sales";
        doc.pending_with_role = "sales";
        doc.current_department = "sales";
        break;
      case "submitted":
        doc.lifecycle_status = "active";
        doc.workflow_stage = "admin_review";
        doc.pending_with_role = "admin";
        doc.current_department = "admin";
        break;
      case "sales_approved":
      case "finance_review":
        doc.lifecycle_status = "active";
        doc.workflow_stage = "finance_review";
        doc.pending_with_role = "finance";
        doc.current_department = "finance";
        break;
      case "finance_approved":
        doc.lifecycle_status = "active";
        doc.workflow_stage = "dispatch";
        doc.pending_with_role = "dispatch";
        doc.current_department = "dispatch";
        break;
      case "finance_rejected":
        doc.lifecycle_status = "active";
        doc.workflow_stage = "sales";
        doc.pending_with_role = "sales";
        doc.current_department = "sales";
        break;
      case "account_review":
        doc.lifecycle_status = "active";
        doc.workflow_stage = "account_review";
        doc.pending_with_role = "account";
        doc.current_department = "account";
        break;
      case "account_approved":
        doc.lifecycle_status = "active";
        doc.workflow_stage = "dispatch";
        doc.pending_with_role = "dispatch";
        doc.current_department = "dispatch";
        break;
      case "account_rejected":
        doc.lifecycle_status = "active";
        doc.workflow_stage = "account_review";
        doc.pending_with_role = "account";
        doc.current_department = "account";
        break;
      case "dispatch":
      case "in_transit":
        doc.lifecycle_status = "active";
        doc.workflow_stage = "dispatch";
        doc.pending_with_role = "dispatch";
        doc.current_department = "dispatch";
        break;
      case "delivered":
        doc.lifecycle_status = "fulfilled";
        doc.workflow_stage = "completed";
        doc.pending_with_role = undefined;
        doc.current_department = undefined;
        break;
      case "cancelled":
        doc.lifecycle_status = "cancelled";
        doc.workflow_stage = "cancelled";
        doc.pending_with_role = undefined;
        doc.current_department = undefined;
        break;
      case "on_hold":
        doc.lifecycle_status = "on_hold";
        doc.workflow_stage = "on_hold";
        doc.pending_with_role = undefined;
        doc.current_department = undefined;
        break;
    }
  }
  next();
});

export default mongoose.model("Order", orderSchema);
