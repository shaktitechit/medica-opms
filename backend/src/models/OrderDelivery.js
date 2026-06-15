/**
 * @fileoverview Order delivery execution model
 */

import mongoose from "mongoose";

const orderDeliveryItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    delivered_quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    remarks: String,
  },
  {
    _id: true,
  },
);

/* =========================================================
 * ORDER DELIVERY
 * ======================================================= */

const orderDeliverySchema = new mongoose.Schema(
  {
    delivery_no: {
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
      required: true,
      index: true,
    },

    transport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportShipment",
      index: true,
    },

    delivery_status: {
      type: String,
      enum: ["pending", "delivered", "failed", "returned"],
      default: "pending",
      index: true,
    },

    delivery_items: [orderDeliveryItemSchema],

    delivered_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    delivered_at: Date,

    actual_delivery_date: Date,

    received_by: String,

    delivery_proof_url: String,

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

export const OrderDelivery = mongoose.model(
  "OrderDelivery",
  orderDeliverySchema,
);

export default OrderDelivery;
