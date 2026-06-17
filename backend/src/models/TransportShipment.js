/**
 * @fileoverview Transport shipment execution model
 */

import mongoose from "mongoose";

/* =========================================================
 * TRANSPORT SHIPMENT
 * ======================================================= */

const transportShipmentSchema = new mongoose.Schema(
  {
    shipment_no: {
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

    transport_agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportAgent",
      index: true,
    },

    transporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transporter",
    },

    shipment_status: {
      type: String,
      enum: [
        "created",
        "transporter_assigned",
        "vehicle_assigned",
        "pickup_pending",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "delivery_failed",
        "returned",
      ],
      default: "created",
      index: true,
    },

    vehicle_number: String,

    driver_name: String,

    driver_mobile: String,

    lr_number: String,

    tracking_number: String,

    eway_bill_no: String,

    transporter_type: {
      type: String,
      enum: ["internal", "external"],
      default: "internal",
    },

    transporter_name: String,

    transporter_phone: String,

    source_location: String,

    destination_location: String,

    route_details: String,

    dispatch_date: Date,

    pickup_date: Date,

    expected_delivery_date: Date,

    actual_delivery_date: Date,

    delivery_proof_url: String,

    remarks: String,

    weight: Number,

    weight_unit: {
      type: String,
      default: "Kg",
    },

    packed_boxes: Number,

    open_boxes: Number,

    total_quantity: Number,

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

export const TransportShipment = mongoose.model(
  "TransportShipment",
  transportShipmentSchema,
);

export default TransportShipment;
