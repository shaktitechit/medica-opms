/**
 * @fileoverview Tracks orders that still have approved qty not yet covered by
 * billed+submitted dispatch (per line and order rollup).
 * Canonical runtime schema also lives in data/mongoRegistry.js.
 * @module models/UnbilledOrder
 */

import mongoose from "mongoose";

const UNBILLED_ORDER_STATUS = ["open", "resolved", "cancelled"];

const BILLING_STATUS = ["unbilled", "partially_billed", "fully_billed"];

/**
 * Snapshot of one order line that still has remaining (unbilled / undispatched) qty.
 */
const unbilledOrderItemSchema = new mongoose.Schema(
  {
    order_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    product_name: {
      type: String,
      trim: true,
      default: "",
    },

    sku: {
      type: String,
      trim: true,
      default: "",
    },

    /** Account/finance-cleared approved qty on the order line. */
    approved_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * Qty already covered by OrderDispatch batches that are submitted
     * (or transport_created) and have a bill_number.
     */
    billed_dispatched_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    /** approved_quantity - billed_dispatched_quantity (clamped ≥ 0). */
    remaining_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: true },
);

const unbilledOrderSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    /** Denormalized for list/search without joining Order. */
    order_no: {
      type: String,
      trim: true,
      index: true,
    },

    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },

    /** Snapshot of Order.billing_status at last sync. */
    billing_status: {
      type: String,
      enum: BILLING_STATUS,
      default: "unbilled",
      index: true,
    },

    status: {
      type: String,
      enum: UNBILLED_ORDER_STATUS,
      default: "open",
      index: true,
    },

    /**
     * Exclusive workflow bucket at last sync (admin_pending, due_sheet_pending,
     * finance_pending, account_pending, dispatch_pending, …).
     */
    pipeline_stage: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    /**
     * When true, remaining qty was written from Settle & Unbilled (settled-away rest)
     * and must not be auto-cleared by live order sync while still open.
     */
    manual_remaining: {
      type: Boolean,
      default: false,
      index: true,
    },

    /**
     * When true, row was closed because remaining qty was moved to a new order
     * (Create Order from Un Billed). Sync must not reopen it.
     */
    manual_resolved: {
      type: Boolean,
      default: false,
      index: true,
    },

    /** New order created to cover this unbilled remaining qty. */
    replacement_order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true,
    },

    approved_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    billed_dispatched_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    remaining_quantity: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    /** Only lines with remaining_quantity > 0. */
    unbilled_items: {
      type: [unbilledOrderItemSchema],
      default: [],
    },

    last_synced_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    remarks: {
      type: String,
      trim: true,
      default: "",
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    resolved_at: Date,

    resolved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

/** One active (non-deleted) tracking row per order. */
unbilledOrderSchema.index(
  { order: 1 },
  {
    name: "unbilled_order_1_active_unique",
    unique: true,
    partialFilterExpression: { deletedAt: null },
  },
);

unbilledOrderSchema.index({ status: 1, remaining_quantity: -1 });
unbilledOrderSchema.index({ party: 1, status: 1 });

export const UnbilledOrder =
  mongoose.models.UnbilledOrder ||
  mongoose.model("UnbilledOrder", unbilledOrderSchema);

export default UnbilledOrder;
