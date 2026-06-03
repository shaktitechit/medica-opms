/**
 * @fileoverview Driver Master
 * @module models/Driver
 */

import mongoose from "mongoose";

const driverSchema = new mongoose.Schema(
  {
    driver_code: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    alternate_phone: {
      type: String,
      trim: true,
    },

    transport_agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportAgent",
      required: true,
      index: true,
    },

    assigned_vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      index: true,
    },

    license_no: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },

    license_type: {
      type: String,
      enum: [
        "LMV",
        "HMV",
        "MCWG",
        "TRANSPORT",
        "OTHER",
      ],
    },

    license_expiry: {
      type: Date,
      index: true,
    },

    aadhaar_no: {
      type: String,
      trim: true,
      select: false,
    },

    joining_date: Date,

    emergency_contact_name: String,

    emergency_contact_phone: String,

    status: {
      type: String,
      enum: [
        "available",
        "assigned",
        "on_trip",
        "leave",
        "inactive",
      ],
      default: "available",
      index: true,
    },

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

driverSchema.index({
  transport_agent: 1,
  status: 1,
});

driverSchema.index({
  assigned_vehicle: 1,
  status: 1,
});

export default mongoose.model(
  "Driver",
  driverSchema
);