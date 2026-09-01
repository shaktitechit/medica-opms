/**
 * @fileoverview ESM mongoose mirror for Lead (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/Lead
 */
import mongoose from "mongoose";

const leadProductItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    product_name: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    target_price: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: "pcs" },
    remarks: String,
  },
  { _id: true }
);

const leadContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    alternate_phone: { type: String, trim: true },
    is_primary: { type: Boolean, default: false },
  },
  { _id: true }
);

const leadAddressSchema = new mongoose.Schema(
  {
    address_line_1: String,
    address_line_2: String,
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    country: { type: String, default: "India" },
  },
  { _id: false }
);

const leadQualificationSchema = new mongoose.Schema(
  {
    requirement_confirmed: { type: Boolean, default: false },
    budget_available: { type: Boolean, default: false },
    decision_maker_known: { type: Boolean, default: false },
    purchase_timeline: { type: String, trim: true },
    competition: { type: String, trim: true },
    qualification_notes: { type: String, trim: true },
    qualified_at: Date,
    qualified_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const leadLostInfoSchema = new mongoose.Schema(
  {
    lost_reason: { type: String, trim: true },
    lost_reason_id: { type: mongoose.Schema.Types.ObjectId, ref: "LeadLostReason" },
    lost_remarks: { type: String, trim: true },
    lost_at: Date,
    lost_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const leadConversionSchema = new mongoose.Schema(
  {
    converted_at: Date,
    converted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    conversion_type: {
      type: String,
      enum: ["existing_customer", "new_customer", "quotation", "order"],
      trim: true,
    },
    party_id: { type: mongoose.Schema.Types.ObjectId, ref: "Party" },
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    quotation_id: { type: mongoose.Schema.Types.ObjectId },
    notes: String,
  },
  { _id: false }
);

const leadSchema = new mongoose.Schema(
  {
    company_id: { type: mongoose.Schema.Types.ObjectId, ref: "CompanyInfo", index: true },
    lead_no: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    company_name: { type: String, trim: true, index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, index: true },
    alternate_phone: { type: String, trim: true },
    contacts: { type: [leadContactSchema], default: [] },

    industry: { type: String, trim: true },
    designation: { type: String, trim: true },
    billing_address: leadAddressSchema,

    requirement: { type: String, trim: true },
    estimated_value: { type: Number, default: 0, min: 0, index: true },
    expected_closing_date: { type: Date, index: true },

    source: { type: String, required: true, trim: true, index: true },
    source_id: { type: mongoose.Schema.Types.ObjectId, ref: "LeadSource" },

    status: {
      type: String,
      enum: [
        "new",
        "follow_up",
        "quotation",
        "won",
        "lost",
        "converted",
      ],
      default: "new",
      index: true,
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },

    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assigned_at: Date,

    party_id: { type: mongoose.Schema.Types.ObjectId, ref: "Party", index: true },
    contact_person_id: { type: String, trim: true },

    products: { type: [leadProductItemSchema], default: [] },
    notes: { type: String, trim: true },
    tags: [{ type: String, trim: true, lowercase: true }],

    qualification: leadQualificationSchema,
    lost_info: leadLostInfoSchema,
    conversion: leadConversionSchema,

    last_contacted_at: Date,
    next_follow_up_at: { type: Date, index: true },
    last_activity_at: { type: Date, default: Date.now, index: true },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

leadSchema.index({ phone: 1, deletedAt: 1 });
leadSchema.index({ email: 1, deletedAt: 1 });
leadSchema.index({ company_name: 1, deletedAt: 1 });
leadSchema.index({ status: 1, assigned_to: 1, deletedAt: 1 });
leadSchema.index({ next_follow_up_at: 1, assigned_to: 1, deletedAt: 1 });

export default mongoose.models.Lead || mongoose.model("Lead", leadSchema);
