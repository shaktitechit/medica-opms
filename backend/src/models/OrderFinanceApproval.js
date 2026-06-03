/**
 * @fileoverview Finance approval execution layer
 * Stores what finance actually approved.
 */

import mongoose from "mongoose";

/* =========================================================
 * APPROVAL ITEMS
 * ======================================================= */

const financeApprovalItemSchema = new mongoose.Schema(
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
    },

    /* -----------------------------------------------------
     * ORDERED
     * --------------------------------------------------- */

    ordered_quantity: {
      type: Number,
      required: true,
    },

    ordered_unit_price: {
      type: Number,
      required: true,
    },

    ordered_total_amount: {
      type: Number,
      required: true,
    },

    /* -----------------------------------------------------
     * APPROVED
     * --------------------------------------------------- */

    approved_quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    approved_unit_price: {
      type: Number,
      default: 0,
      min: 0,
    },

    approved_total_amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* -----------------------------------------------------
     * APPROVAL STATUS
     * --------------------------------------------------- */

    approval_status: {
      type: String,
      enum: [
        "pending",
        "partially_approved",
        "fully_approved",
        "rejected",
        "hold",
      ],
      default: "pending",
      index: true,
    },

    rejection_reason: String,

    hold_reason: String,

    remarks: String,
  },
  {
    _id: true,
  },
);

/* =========================================================
 * FINANCE APPROVAL
 * ======================================================= */

const orderFinanceApprovalSchema = new mongoose.Schema(
  {
    approval_no: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    revision_number: {
      type: Number,
      default: 1,
      index: true,
    },

    approval_status: {
      type: String,
      enum: [
        "draft",
        "pending_review",
        "partially_approved",
        "fully_approved",
        "rejected",
        "hold",
        "cancelled",
      ],
      default: "draft",
      index: true,
    },

    /* -----------------------------------------------------
     * COMMERCIAL TOTALS
     * --------------------------------------------------- */

    ordered_total_amount: {
      type: Number,
      required: true,
    },

    approved_total_amount: {
      type: Number,
      default: 0,
    },

    rejected_total_amount: {
      type: Number,
      default: 0,
    },

    /* -----------------------------------------------------
     * ITEMS
     * --------------------------------------------------- */

    approval_items: [financeApprovalItemSchema],

    /* -----------------------------------------------------
     * FINANCE DECISION
     * --------------------------------------------------- */

    credit_limit_checked: {
      type: Boolean,
      default: false,
    },

    outstanding_checked: {
      type: Boolean,
      default: false,
    },

    risk_level: {
      type: String,
      enum: [
        "low",
        "medium",
        "high",
        "critical",
      ],
      default: "low",
    },

    approval_notes: String,

    rejection_reason: String,

    hold_reason: String,

    /* -----------------------------------------------------
     * USERS
     * --------------------------------------------------- */

    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    rejected_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reviewed_at: Date,

    approved_at: Date,

    rejected_at: Date,

    /* -----------------------------------------------------
     * AUDIT
     * --------------------------------------------------- */

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

/* =========================================================
 * INDEXES
 * ======================================================= */

orderFinanceApprovalSchema.index({
  order: 1,
  revision_number: -1,
});

orderFinanceApprovalSchema.index({
  approval_status: 1,
  createdAt: -1,
});

export default mongoose.model(
  "OrderFinanceApproval",
  orderFinanceApprovalSchema,
);
