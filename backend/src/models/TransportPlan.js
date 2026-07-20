/**
 * @fileoverview ESM mongoose mirror for TransportPlan (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/TransportPlan
 */

import mongoose from "mongoose";

const TRANSPORT_PLAN_STATUSES = [
  "draft",
  "planned",
  "submitted",
  "in_transit",
  "completed",
  "cancelled",
];

const transportPlanSchema = new mongoose.Schema(
  {
    plan_date: { type: Date, required: true, index: true },
    transport_agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportAgent",
      required: true,
      index: true,
    },
      status: {
        type: String,
        enum: TRANSPORT_PLAN_STATUSES,
        default: "planned",
        index: true,
      },
    remarks: { type: String, trim: true },
    submitted_at: Date,
    completed_at: Date,
    cancelled_at: Date,
    cancellation_reason: { type: String, trim: true },
    deletedAt: { type: Date, default: null, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

transportPlanSchema.index({ plan_date: 1, status: 1 });
transportPlanSchema.index({ transport_agent: 1, plan_date: -1 });

export default mongoose.models.TransportPlan ||
  mongoose.model("TransportPlan", transportPlanSchema);
