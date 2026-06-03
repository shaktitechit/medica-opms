
/**
 * @fileoverview Core commercial order document
 * ONLY stores current commercial state.
 */

import mongoose from "mongoose";

/* =========================================================
 * ORDER ITEM
 * ======================================================= */

const orderItemSchema = new mongoose.Schema(
  {
    /* -----------------------------------------------------
     * PRODUCT SNAPSHOT
     * --------------------------------------------------- */

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

    /* -----------------------------------------------------
     * QUANTITY
     * --------------------------------------------------- */

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

    free_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    allocated_quantity: {
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

    cancelled_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* -----------------------------------------------------
     * PRICING
     * --------------------------------------------------- */

    unit_price: {
      type: Number,
      required: true,
      min: 0,
    },

    applied_rate_type: {
      type: String,
      enum: ["SR", "SSR", "CR", "MANUAL"],
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

    /* -----------------------------------------------------
     * APPROVAL
     * --------------------------------------------------- */

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

    /* -----------------------------------------------------
     * DISCOUNT
     * --------------------------------------------------- */

    discount_percent: {
      type: Number,
      default: 0,
    },

    discount_amount: {
      type: Number,
      default: 0,
    },

    /* -----------------------------------------------------
     * TAXATION
     * --------------------------------------------------- */

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

    /* -----------------------------------------------------
     * LINE STATUS
     * --------------------------------------------------- */

    line_status: {
      type: String,
      enum: [
        "draft",
        "active",
        "partially_allocated",
        "fully_allocated",
        "partially_dispatched",
        "fully_dispatched",
        "partially_delivered",
        "fully_delivered",
        "cancelled",
      ],
      default: "draft",
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
    /* -----------------------------------------------------
     * BASIC
     * --------------------------------------------------- */

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

    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true,
    },

    /* -----------------------------------------------------
     * PARTY
     * --------------------------------------------------- */

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

    status: {
      type: String,
      enum: [
        "draft",
        "submitted",
        "sales_approved",
        "finance_review",
        "finance_approved",
        "partially_finance_approved",
        "fully_finance_approved",
        "finance_rejected",
        "dispatch_pending",
        "partial_dispatch_created",
        "full_dispatch_created",
        "transport_pending",
        "transport_assigned",
        "partially_transported",
        "fully_transported",
        "in_transit",
        "delivered",
        "cancelled",
        "on_hold",
      ],
      default: "draft",
      index: true,
    },

    lifecycle_status: {
      type: String,
      enum: [
        "draft",
        "active",
        "partially_fulfilled",
        "fulfilled",
        "cancelled",
        "closed",
        "on_hold",
      ],
      default: "draft",
      index: true,
    },

    /* -----------------------------------------------------
     * WORKFLOW ENGINE
     * --------------------------------------------------- */

    workflow_stage: {
      type: String,
      enum: [
        "sales",
        "admin_review",
        "finance_review",
        "dispatch_review",
        "dispatch_execution",
        "completed",
        "cancelled",
        "hold",
      ],
      default: "sales",
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

    /* -----------------------------------------------------
     * OWNERSHIP
     * --------------------------------------------------- */

    current_assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    assigned_sales_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    assigned_admin_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    assigned_finance_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    assigned_dispatch_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    current_department: {
      type: String,
      enum: ["super_admin", "sales", "admin", "finance", "dispatch"],
      index: true,
    },

    pending_with_role: {
      type: String,
      enum: ["super_admin", "sales", "admin", "finance", "dispatch"],
      index: true,
    },

    /* -----------------------------------------------------
     * FINANCIALS
     * --------------------------------------------------- */

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

    payment_status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
      index: true,
    },

    finance_approval_status: {
      type: String,
      enum: ["pending", "partial", "full", "rejected"],
      default: "pending",
      index: true,
    },

    last_finance_approval: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderFinanceApproval",
      index: true,
    },

    /* -----------------------------------------------------
     * EXECUTION STATUS
     * --------------------------------------------------- */

    allocation_status: {
      type: String,
      enum: ["pending", "partial", "completed"],
      default: "pending",
    },

    dispatch_status: {
      type: String,
      enum: ["pending", "partial", "completed"],
      default: "pending",
    },

    delivery_status: {
      type: String,
      enum: ["pending", "partial", "completed"],
      default: "pending",
    },

    /* -----------------------------------------------------
     * ITEMS
     * --------------------------------------------------- */

    order_items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: "Order must contain at least one item.",
      },
    },

    /* -----------------------------------------------------
     * FLAGS
     * --------------------------------------------------- */

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

    /* -----------------------------------------------------
     * REMARKS
     * --------------------------------------------------- */

    remarks: String,

    internal_notes: String,

    /* -----------------------------------------------------
     * AUDIT
     * --------------------------------------------------- */

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

orderSchema.index({
  customer: 1,
  order_date: -1,
});

orderSchema.index({
  workflow_stage: 1,
  lifecycle_status: 1,
});

orderSchema.index({
  current_assignee: 1,
  workflow_stage: 1,
});

export default mongoose.model("Order", orderSchema);
