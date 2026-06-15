/**
 * @fileoverview Per-order department assignees (multiple users per department).
 * Canonical assignment store; Order.assigned_* fields remain denormalized primary assignee for queries/API compat.
 */

import mongoose from "mongoose";

const ORDER_ASSIGNEE_DEPARTMENTS = [
  "sales",
  "admin",
  "finance",
  "dispatch",
];

const orderAssigneeSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    department: {
      type: String,
      enum: ORDER_ASSIGNEE_DEPARTMENTS,
      required: true,
      index: true,
    },

    assignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    assigned_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    assigned_at: {
      type: Date,
      default: Date.now,
      index: true,
    },

    remarks: String,
  },
  {
    timestamps: true,
  },
);

/* One row per order per department per user */
orderAssigneeSchema.index(
  { order: 1, department: 1, assignee: 1 },
  { unique: true },
);

orderAssigneeSchema.index({ assignee: 1, department: 1 });
orderAssigneeSchema.index({ order: 1, assigned_at: -1 });

export { ORDER_ASSIGNEE_DEPARTMENTS };
export default mongoose.model("OrderAssignee", orderAssigneeSchema);
