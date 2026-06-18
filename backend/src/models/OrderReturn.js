/**
 * @fileoverview Order return execution model
 */

import mongoose from "mongoose";

/* =========================================================
 * ORDER RETURN ITEM
 * ======================================================= */

const orderReturnItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    returned_quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    return_reason: String,

    remarks: String,

    expiry_type: {
      type: String,
      enum: ["expiry", "other"],
      default: "other",
    },

    expiry_date: Date,
  },
  {
    _id: true,
  },
);

/* =========================================================
 * ORDER RETURN
 * ======================================================= */

const orderReturnSchema = new mongoose.Schema(
  {
    return_no: {
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

    dispatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderDispatch",
      index: true,
    },

    transport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportShipment",
      index: true,
    },

    delivery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderDelivery",
      index: true,
    },

    return_status: {
      type: String,
      enum: ["pending", "received_at_warehouse"],
      default: "pending",
      index: true,
    },

    return_items: [orderReturnItemSchema],

    returned_by: String,

    received_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    received_at: Date,

    order_closed_at: Date,

    remarks: String,

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export const OrderReturn = mongoose.model(
  "OrderReturn",
  orderReturnSchema,
);

export default OrderReturn;
