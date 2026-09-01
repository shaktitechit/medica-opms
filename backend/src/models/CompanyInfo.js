/**
 * @fileoverview ESM mongoose mirror for CompanyInfo (canonical runtime schemas live in data/mongoRegistry.js).
 * @module models/CompanyInfo
 */
import mongoose from "mongoose";

const companyInfoSchema = new mongoose.Schema(
  {
    legal_name: { type: String, trim: true, default: "" },
    trade_name: { type: String, trim: true, default: "" },
    gstin: { type: String, trim: true, uppercase: true, default: "" },
    cin: { type: String, trim: true, uppercase: true, default: "" },
    pan: { type: String, trim: true, uppercase: true, default: "" },
    drug_license: { type: String, trim: true, default: "" },
    fssai_license: { type: String, trim: true, default: "" },
    email: { type: String, lowercase: true, trim: true, default: "" },
    billing_email: { type: String, lowercase: true, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    logo_url: { type: String, trim: true, default: "" },
    favicon_url: { type: String, trim: true, default: "" },
    primary_color: { type: String, trim: true, default: "#636ccb" },
    secondary_color: { type: String, trim: true, default: "#6e8cfb" },
    theme_palette: { type: String, trim: true, default: "default" },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    currency: { type: String, trim: true, default: "" },
    timezone: { type: String, trim: true, default: "" },
    financial_year: { type: String, trim: true, default: "" },
    invoice_footer_note: { type: String, trim: true, default: "" },
    bank_name: { type: String, trim: true, default: "" },
    account_name: { type: String, trim: true, default: "" },
    account_number: { type: String, trim: true, default: "" },
    ifsc_code: { type: String, trim: true, uppercase: true, default: "" },
    branch_name: { type: String, trim: true, default: "" },
    account_type: { type: String, trim: true, default: "" },
    upi_id: { type: String, trim: true, default: "" },
    swift_code: { type: String, trim: true, uppercase: true, default: "" },
    quotation_terms: [{ type: String }],
    is_default: { type: Boolean, default: true, index: true },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.CompanyInfo || mongoose.model("CompanyInfo", companyInfoSchema);
