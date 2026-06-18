/**
 * @fileoverview Customer / supplier / both (hospital, distributor, OEM). Canonical runtime: data/mongoRegistry.js.
 * @module models/Party
 */
import mongoose from "mongoose";

const partyAddressSchema = new mongoose.Schema(
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

const partyContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    department: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    alternate_phone: { type: String, trim: true },
  },
  { _id: false }
);

const partySchema = new mongoose.Schema(
  {
    party_type: {
      type: String,
      enum: ["customer", "supplier", "both"],
      default: "customer",
      index: true,
    },
    party_name: { type: String, required: true, trim: true },
    contact_person: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    contacts: { type: [partyContactSchema], default: [] },
    gst_no: { type: String, uppercase: true, trim: true },
    drug_license_no: { type: String, trim: true },
    billing_address: partyAddressSchema,
    shipping_address: partyAddressSchema,
    district: { type: String, trim: true },
    state: { type: String, trim: true },
    payment_terms: { type: String, trim: true },
    /** Trace import from legacy Customer document during migration */
    legacy_customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", unique: true, sparse: true },
    is_active: { type: Boolean, default: true },
    sra: { type: Boolean, default: false },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

partySchema.index({ party_name: 1 });
partySchema.index({ gst_no: 1 }, { sparse: true });

export default mongoose.models.Party || mongoose.model("Party", partySchema);
