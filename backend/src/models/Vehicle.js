/**
 * @fileoverview Vehicle Master
 * @module models/Vehicle
 */

import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    vehicle_no: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    transport_agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportAgent",
      index: true,
    },

    vehicle_type: {
      type: String,
      enum: [
        "bike",
        "three_wheeler",
        "pickup",
        "mini_truck",
        "truck",
        "container",
        "other",
      ],
      default: "pickup",
      index: true,
    },

    ownership_type: {
      type: String,
      enum: [
        "owned",
        "attached",
        "rented",
        "third_party",
      ],
      default: "owned",
      index: true,
    },

    status: {
      type: String,
      enum: [
        "available",
        "assigned",
        "in_transit",
        "maintenance",
        "inactive",
      ],
      default: "available",
      index: true,
    },

    make: {
      type: String,
      trim: true,
    },

    model: {
      type: String,
      trim: true,
    },

    capacity_kg: {
      type: Number,
      min: 0,
    },

    capacity_cft: {
      type: Number,
      min: 0,
    },

    insurance_expiry: Date,

    fitness_expiry: Date,

    pollution_expiry: Date,

    registration_expiry: Date,

    remarks: {
      type: String,
      trim: true,
    },

    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },

    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

/* ------------------------------------------
 * Indexes
 * ---------------------------------------- */

vehicleSchema.index({
  transport_agent: 1,
  status: 1,
});

vehicleSchema.index({
  vehicle_type: 1,
  ownership_type: 1,
});

export default mongoose.model(
  "Vehicle",
  vehicleSchema
);