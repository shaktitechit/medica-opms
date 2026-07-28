/**
 * @fileoverview ESM mongoose mirror for WorkPlanExpense (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/WorkPlanExpense
 */

import mongoose from "mongoose";

const WORK_PLAN_EXPENSE_STATUSES = ["draft", "submitted", "approved", "rejected"];
const WORK_PLAN_EXPENSE_CATEGORIES = [
  "Travel",
  "Accommodation",
  "Food",
  "Communication",
  "Client Entertainment",
  "Marketing",
  "Office",
  "Miscellaneous",
];
const WORK_PLAN_EXPENSE_PAYMENT_MODES = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Company Card",
];

const workPlanExpenseSchema = new mongoose.Schema(
  {
    work_plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkPlan",
      required: true,
      index: true,
    },
    work_plan_visit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkPlanVisit",
      default: null,
      index: true,
    },
    expense_date: { type: Date, required: true, index: true },
    category: {
      type: String,
      enum: WORK_PLAN_EXPENSE_CATEGORIES,
      required: true,
      index: true,
    },
    sub_category: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    payment_mode: {
      type: String,
      enum: WORK_PLAN_EXPENSE_PAYMENT_MODES,
      required: true,
    },
    vendor_name: { type: String, trim: true },
    bill_number: { type: String, trim: true },
    bill_date: Date,
    description: { type: String, trim: true },
    receipt_attachment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attachment",
      default: null,
    },
    start_reading: { type: Number, min: 0 },
    closing_reading: { type: Number, min: 0 },
    start_reading_image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attachment",
      default: null,
    },
    end_reading_image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attachment",
      default: null,
    },
    status: {
      type: String,
      enum: WORK_PLAN_EXPENSE_STATUSES,
      default: "draft",
      index: true,
    },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approved_at: Date,
    rejection_reason: { type: String, trim: true },
    deletedAt: { type: Date, default: null, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

workPlanExpenseSchema.index({ work_plan: 1, status: 1, deletedAt: 1 });

export default mongoose.models.WorkPlanExpense ||
  mongoose.model("WorkPlanExpense", workPlanExpenseSchema);
