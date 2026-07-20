/**
 * @fileoverview ESM mongoose mirror for WorkPlan (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/WorkPlan
 */

import mongoose from "mongoose";

const WORK_PLAN_STATUSES = ["draft", "submitted", "approved", "rejected", "completed"];

const workPlanSchema = new mongoose.Schema(
  {
    plan_date: { type: Date, required: true, index: true },
    sales_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: WORK_PLAN_STATUSES,
      default: "draft",
      index: true,
    },
    remarks: { type: String, trim: true },
    submitted_at: Date,
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approved_at: Date,
    rejection_reason: { type: String, trim: true },
    deletedAt: { type: Date, default: null, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

workPlanSchema.index(
  { sales_user: 1, plan_date: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
  }
);

export default mongoose.models.WorkPlan || mongoose.model("WorkPlan", workPlanSchema);
