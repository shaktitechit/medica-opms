/**
 * @fileoverview ESM mongoose mirror for WorkPlanWork (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/WorkPlanWork
 */

import mongoose from "mongoose";

const workPlanWorkSchema = new mongoose.Schema(
  {
    work_plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkPlan",
      required: true,
      index: true,
    },
    sequence: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    planned_start_time: Date,
    planned_end_time: Date,
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    completion_remarks: { type: String, trim: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

workPlanWorkSchema.index(
  { work_plan: 1, sequence: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
  }
);

export default mongoose.models.WorkPlanWork ||
  mongoose.model("WorkPlanWork", workPlanWorkSchema);
