/**
 * @fileoverview Transport Agent Master
 * @module models/TransportAgent
 */

import mongoose from "mongoose";

const transportAgentSchema = new mongoose.Schema(
  {
    agent_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    agent_name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    agent_type: {
      type: String,
      enum: [
        "internal_fleet",
        "third_party",
        "courier",
      ],
      required: true,
      index: true,
    },

    contact_person: {
      type: String,
      trim: true,
    },

    mobile: {
      type: String,
      trim: true,
      index: true,
    },

    alternate_mobile: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    gst_no: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },

    pan_no: {
      type: String,
      trim: true,
      uppercase: true,
    },

    payment_terms: {
      type: String,
      trim: true,
    },

    address: {
      line1: String,
      line2: String,
      city: String,
      district: String,
      state: String,
      pincode: String,
      country: {
        type: String,
        default: "India",
      },
    },

    service_areas: [
      {
        state: String,
        district: String,
      },
    ],

    status: {
      type: String,
      enum: [
        "active",
        "inactive",
        "blacklisted",
      ],
      default: "active",
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

/* -----------------------------------------
 * Indexes
 * --------------------------------------- */

transportAgentSchema.index({
  agent_type: 1,
  status: 1,
});

transportAgentSchema.index({
  agent_name: 1,
  is_active: 1,
});

transportAgentSchema.index({
  mobile: 1,
});

export default mongoose.model(
  "TransportAgent",
  transportAgentSchema
);