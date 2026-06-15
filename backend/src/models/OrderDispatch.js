/**
 * @fileoverview Dispatch execution model
 */

import mongoose from "mongoose";

/* =========================================================
 * DISPATCH ITEMS
 * ======================================================= */

const dispatchItemSchema = new mongoose.Schema(
  {
    order_item_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
    },

    allocated_quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    dispatched_quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    delivered_quantity: {
      type: Number,
      default: 0,
    },

    remarks: String,
  },
  {
    _id: true,
  },
);

/* =========================================================
 * ORDER DISPATCH
 * ======================================================= */

const orderDispatchSchema = new mongoose.Schema(
  {
    dispatch_no: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    finance_approval: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderApproval",
      index: true,
    },

    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
    },

    warehouse_location: String,

    dispatch_status: {
      type: String,
      enum: [
        "draft",
        "allocation_pending",
        "allocated",
        "packing",
        "partially_dispatched",
        "fully_dispatched",
        "cancelled",
      ],
      default: "draft",
      index: true,
    },

    dispatch_items: [dispatchItemSchema],

    packed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    dispatched_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    dispatch_assignee_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    packed_at: Date,

    dispatched_at: Date,

    bill_number: String,

    billing_date: Date,

    bill_document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attachment",
    },

    remarks: String,

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const OrderDispatch = mongoose.model(
  "OrderDispatch",
  orderDispatchSchema,
);

export default OrderDispatch;
