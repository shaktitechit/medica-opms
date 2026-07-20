/**
 * @fileoverview ESM mongoose mirror for WorkPlanVisit (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/WorkPlanVisit
 */

import mongoose from "mongoose";

const WORK_PLAN_VISIT_STATUSES = [
  "pending",
  "checked_in",
  "completed",
  "cancelled",
  "skipped",
  "rescheduled",
];

const workPlanVisitSchema = new mongoose.Schema(
  {
    work_plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkPlan",
      required: true,
      index: true,
    },
    sequence: { type: Number, required: true, min: 1 },
    party: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },
    contact_person: { type: String, trim: true },
    contact_number: { type: String, trim: true },
    address: { type: String, trim: true },
    planned_start_time: Date,
    planned_end_time: Date,
    purpose: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: {
      type: String,
      enum: WORK_PLAN_VISIT_STATUSES,
      default: "pending",
      index: true,
    },
    actual_check_in: Date,
    actual_check_out: Date,
    outcome: { type: String, trim: true },
    next_followup_date: Date,
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

workPlanVisitSchema.index(
  { work_plan: 1, sequence: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
  }
);

export default mongoose.models.WorkPlanVisit ||
  mongoose.model("WorkPlanVisit", workPlanVisitSchema);
