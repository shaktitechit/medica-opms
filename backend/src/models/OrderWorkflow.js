/**
 * @fileoverview Immutable workflow event log — one document per transition or milestone.
 * @module models/OrderWorkflow
 *
 * ## Order vs OrderWorkflow (not status duplication)
 *
 * | Concern | `Order` | `OrderWorkflow` |
 * |--------|---------|-----------------|
 * | Role | **Current snapshot** — where the order sits right now | **Append-only history** — what changed and who did it |
 * | Fields | `lifecycle_status`, `workflow_stage`, `status`, `current_action` | `from_*` / `to_*` snapshots + `action`, `role`, actor |
 * | Updates | Overwritten on each transition | Never updated; new row per event |
 *
 * `Order` answers: *where is this order now?*
 * `OrderWorkflow` answers: *how did it get here?*
 *
 * Stage/status strings on each row mirror `Order.workflow_stage` and `Order.status`
 * at the time of the event. Legacy values (e.g. `fully_finance_approved`,
 * `dispatch_execution`) may appear in older rows until callers are fully migrated.
 *
 * @see models/Order.js — canonical enums for lifecycle, stage, and queue status
 */

import mongoose from "mongoose";

const WORKFLOW_ROLES = [
  "super_admin",
  "sales",
  "admin",
  "finance",
  "account",
  "dispatch",
];

const orderWorkflowSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    action_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /** Department of the actor at event time. */
    role: {
      type: String,
      enum: WORKFLOW_ROLES,
      required: true,
      index: true,
    },

    /**
     * Event label — usually mirrors `Order.current_action` after the transition.
     * Examples: submitted, sales_approved, finance_approved, dispatch, delivered, closed.
     * Stored as free text so historical rows survive enum migrations.
     */
    action: {
      type: String,
      required: true,
      index: true,
    },

    /** `Order.workflow_stage` before the event (ORDER_WORKFLOW_STAGE + legacy aliases). */
    from_stage: { type: String, index: true },

    /** `Order.workflow_stage` after the event. */
    to_stage: { type: String, index: true },

    /** `Order.status` before the event (ORDER_STATUS + legacy aliases). */
    from_status: { type: String, index: true },

    /** `Order.status` after the event. */
    to_status: { type: String, index: true },

    reason_code: String,

    remarks: String,

    internal_notes: String,

    revision_number: {
      type: Number,
      default: 1,
    },

    /** Optional link to approval, dispatch, shipment, etc. */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },

    ip_address: String,

    user_agent: String,

    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  },
);

orderWorkflowSchema.index({ order: 1, created_at: -1 });

export default mongoose.model("OrderWorkflow", orderWorkflowSchema);
