/**
 * @fileoverview ESM mongoose mirror for Reminder (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/Reminder
 */
import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
  {
    followup_date: { type: Date, required: true },
    remarks: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "pending",
    },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: true, timestamps: true }
);

const reminderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", index: true },

    follow_ups: { type: [followUpSchema], default: [] },

    next_followup_date: { type: Date, index: true },

    status: {
      type: String,
      enum: ["active", "completed", "dismissed"],
      default: "active",
      index: true,
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.Reminder || mongoose.model("Reminder", reminderSchema);
