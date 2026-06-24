/**
 * @fileoverview ESM mongoose mirror for OrderApproval (canonical schemas live in data/mongoRegistry).
 * @module models/OrderApproval
 */
import mongoose from "mongoose";

const orderApprovalSchema = new mongoose.Schema(
  {
    approval_no: { type: String, unique: true, sparse: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    revision_number: { type: Number, default: 1, index: true },


    ordered_total_amount: { type: Number },
    approved_total_amount: { type: Number, default: 0 },
    rejected_total_amount: { type: Number, default: 0 },

    // Decisions/Signatures for Sales/Admin
    is_admin_approved: { type: Boolean, default: false },
    admin_approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    admin_approved_at: Date,

    // Decisions/Signatures for Finance
    is_finance_approved: { type: Boolean, default: false },
    finance_approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    finance_approved_at: Date,

    // Decisions/Signatures for Account
    is_account_approved: { type: Boolean, default: false },
    account_approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    account_approved_at: Date,

    // Operational properties
    rates_reviewed: { type: Boolean, default: false },
    all_rates_mapped: { type: Boolean, default: false },
    credit_limit_checked: { type: Boolean, default: false },
    outstanding_checked: { type: Boolean, default: false },
    risk_level: { type: String, enum: ["low", "medium", "high", "critical"], default: "low" },
    approval_notes: String,
    rejection_reason: String,
    hold_reason: String,

    assigned_finance_user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    assigned_account_user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    sent_to_finance_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sent_to_finance_at: Date,
    sent_to_account_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    sent_to_account_at: Date,
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewed_at: Date,
    finance_amended: { type: Boolean, default: false },
    finance_amended_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    finance_amended_at: Date,
    account_amended: { type: Boolean, default: false },
    account_amended_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    account_amended_at: Date,
    admin_amended: { type: Boolean, default: false },
    admin_amended_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    admin_amended_at: Date,

    // Detailed line items being approved
    approval_items: [
      {
        order_item_id: { type: mongoose.Schema.Types.ObjectId, required: true },
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        ordered_quantity: { type: Number, required: true },
        ordered_unit_price: { type: Number, required: true },
        ordered_total_amount: { type: Number, required: true },
        approved_quantity: { type: Number, default: 0 },
        approved_unit_price: { type: Number, default: 0 },
        approved_total_amount: { type: Number, default: 0 },

        applied_rate_type: { type: String, default: "SR" },
        pricing_reference: { type: mongoose.Schema.Types.ObjectId, ref: "PartyProductRate" },
        manual_price_override: { type: Boolean, default: false },
        rate_mapped: { type: Boolean, default: false },
        discount_percent: { type: Number, default: 0 },
        discount_amount: { type: Number, default: 0 },
        gst_percent: { type: Number, default: 0 },
        free_quantity: { type: Number, default: 0 },
        remarks: String,
      }
    ],

    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approved_at: Date,
    rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejected_at: Date,
    remarks: String,
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("OrderApproval", orderApprovalSchema);