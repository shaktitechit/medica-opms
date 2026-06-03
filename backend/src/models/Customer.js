/**
 * @fileoverview ESM mongoose mirror for Customer (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/Customer
 */
import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    address_line_1: String,
    address_line_2: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: "India" },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    customer_name: { type: String, required: true, trim: true },
    company_name: { type: String, trim: true },
    gst_number: { type: String, uppercase: true, trim: true },

    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    alternate_phone: String,

    customer_type: {
      type: String,
      enum: ["individual", "business", "dealer", "distributor"],
      default: "business",
    },

    billing_address: addressSchema,
    shipping_address: addressSchema,

    credit_limit: { type: Number, default: 0 },
    outstanding_amount: { type: Number, default: 0 },

    is_active: { type: Boolean, default: true },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Customer", customerSchema);