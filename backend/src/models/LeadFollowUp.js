/**
 * @fileoverview ESM mongoose mirror for LeadFollowUp (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/LeadFollowUp
 */
import mongoose from "mongoose";

const leadFollowUpSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    follow_up_date: { type: Date, required: true, index: true },
    follow_up_time: { type: String, trim: true },
    type: {
      type: String,
      enum: ["call", "meeting", "email", "whatsapp", "visit", "demo", "other"],
      default: "call",
      index: true,
    },
    notes: { type: String, trim: true },
    outcome: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled", "rescheduled"],
      default: "pending",
      index: true,
    },
    next_follow_up_date: { type: Date },
    completed_at: { type: Date },
    completed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.LeadFollowUp || mongoose.model("LeadFollowUp", leadFollowUpSchema);
