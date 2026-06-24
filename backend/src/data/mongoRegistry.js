/**
 * @fileoverview Registers all mongoose models/schemas used by this API (includes soft-delete where applied).
 * @module data/mongoRegistry
 */
const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');

const MODULE_ENUM = [
  'user',
  'customer',
  'party',
  'product',
  'order',
  'finance',
  'dispatch',
  'transport',
  'flag',
  'dashboard',
  'report',
  'system',
];

/** @type {Record<string, mongoose.Model> | null} */
let _cached = null;

function registerModels() {
  // --- Schemas from Permission.js ---
  /**
   * @fileoverview ESM mongoose mirror for Permission (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/Permission
   */
  
  
  const permissionSchema = new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true },
      code: { type: String, required: true, unique: true, lowercase: true, trim: true },
  
      module: { type: String, required: true, enum: MODULE_ENUM },
  
      description: String,
    },
    { timestamps: true }
  );
  
  mongoose.model("Permission", permissionSchema);

  // --- Schemas from Role.js ---
  /**
   * @fileoverview ESM mongoose mirror for Role (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/Role
   */
  
  
  const roleSchema = new mongoose.Schema(
    {
      name: { type: String, required: true, unique: true, trim: true },
      code: { type: String, required: true, unique: true, lowercase: true, trim: true },
  
      department: {
        type: String,
        enum: ["super_admin", "admin", "sales", "finance", "account", "dispatch"],
        required: true,
      },
  
      permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Permission" }],
  
      is_system_role: { type: Boolean, default: false },
      is_active: { type: Boolean, default: true },
    },
    { timestamps: true }
  );
  
  mongoose.model("Role", roleSchema);

  // --- Schemas from User.js ---
  /**
   * @fileoverview ESM mongoose mirror for User (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/User
   */
  
  
  const userSchema = new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      phone: { type: String, trim: true },
      password: { type: String, required: true, select: false },
  
      department: {
        type: String,
        enum: ["super_admin", "admin", "sales", "finance", "account", "dispatch"],
        required: true,
      },
  
      roles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],
  
      is_active: { type: Boolean, default: true },
      last_login_at: Date,
    },
    { timestamps: true }
  );
  
  mongoose.model("User", userSchema);

  // --- Schemas from Customer.js ---
  /**
   * @fileoverview ESM mongoose mirror for Customer (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/Customer
   */
  
  
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
  
  customerSchema.plugin(softDeletePlugin);
  mongoose.model("Customer", customerSchema);

  // --- Schemas from Product.js ---
  /**
   * @fileoverview ESM mongoose mirror for Product (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/Product
   */
  
  const productSchema = new mongoose.Schema(
    {
      product_name: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },
      generic_name: {
        type: String,
        trim: true,
      },
      aliases: [
        {
          type: String,
          trim: true,
          lowercase: true,
        },
      ],
      sku: {
        type: String,
        unique: true,
        sparse: true,
        uppercase: true,
        trim: true,
        index: true,
      },
      product_group: {
        type: String,
        trim: true,
        index: true,
      },
      product_subgroup: {
        type: String,
        trim: true,
        index: true,
      },
      brand: {
        type: String,
        trim: true,
        index: true,
      },
      manufacturer: {
        type: String,
        trim: true,
        index: true,
      },
      unit: {
        type: String,
        enum: ["pcs", "box", "kg", "ltr", "meter", "set", "kit", "bottle"],
        default: "pcs",
      },
      base_price: {
        type: Number,
        required: true,
        min: 0,
      },
      minimum_sale_rate: {
        type: Number,
        required: true,
        min: 0,
      },
      mrp: {
        type: Number,
        min: 0,
      },
      gst_percent: {
        type: Number,
        default: 18,
        min: 0,
        max: 100,
      },
      warranty_months: {
        type: Number,
        default: 0,
        min: 0,
      },
      description: {
        type: String,
        trim: true,
      },
      tags: [
        {
          type: String,
          trim: true,
          lowercase: true,
        },
      ],
      searchable_text: {
        type: String,
        select: false,
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

  productSchema.index({
    product_name: "text",
    generic_name: "text",
    aliases: "text",
    sku: "text",
    brand: "text",
    manufacturer: "text",
    product_group: "text",
  });

  productSchema.index({
    product_group: 1,
    product_subgroup: 1,
  });

  productSchema.index({
    brand: 1,
    manufacturer: 1,
  });

  productSchema.index({
    is_active: 1,
    deletedAt: 1,
  });

  productSchema.plugin(softDeletePlugin);

  mongoose.model("Product", productSchema);



  const warehouseAddressSchema = new mongoose.Schema(
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
  const warehouseSchema = new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true },
      address: warehouseAddressSchema,
      is_active: { type: Boolean, default: true },
      deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
  );
  warehouseSchema.plugin(softDeletePlugin);
  mongoose.model("Warehouse", warehouseSchema);

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
      legacy_customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", unique: true, sparse: true },
      is_active: { type: Boolean, default: true },
      sra: { type: Boolean, default: false },
      sra_from_date: { type: Date, default: null },
      sra_to_date: { type: Date, default: null },
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
  );
  partySchema.index({ party_name: 1 });
  partySchema.index({ gst_no: 1 }, { sparse: true });
  partySchema.plugin(softDeletePlugin);
  mongoose.model("Party", partySchema);

  const batchSchema = new mongoose.Schema(
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
      batch_no: { type: String, required: true, trim: true },
      serial_no: { type: String, trim: true },
      expiry_date: { type: Date, index: true },
      manufacturing_date: Date,
      purchase_rate: { type: Number, default: 0, min: 0 },
      mrp: { type: Number, default: 0, min: 0 },
      sale_rate: { type: Number, min: 0 },
      available_qty: { type: Number, default: 0, min: 0 },
      reserved_qty: { type: Number, default: 0, min: 0 },
      warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", index: true },
      supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Party", index: true },
      inward_invoice_no: { type: String, trim: true },
      inward_date: Date,
      status: {
        type: String,
        enum: ["active", "expired", "damaged", "recalled"],
        default: "active",
        index: true,
      },
      deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
  );
  batchSchema.index({ product: 1, expiry_date: 1 });
  batchSchema.index({ product: 1, batch_no: 1 }, { unique: true });
  batchSchema.plugin(softDeletePlugin);
  mongoose.model("Batch", batchSchema);

  const partyProductLastRateSchema = new mongoose.Schema(
    {
      party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", required: true },
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      last_rate: { type: Number, required: true, min: 0 },
      last_discount_percent: { type: Number, default: 0, min: 0, max: 100 },
      last_batch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch" },
      last_order_date: { type: Date, default: Date.now },
    },
    { timestamps: true, collection: "party_product_last_rates" }
  );
  partyProductLastRateSchema.index({ party: 1, product: 1 }, { unique: true });
  mongoose.model("PartyProductLastRate", partyProductLastRateSchema);

  // --- Schemas from PartyProductMapping.js ---
  const partyProductMappingSchema = new mongoose.Schema(
    {
      party: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Party",
        required: true,
        index: true,
      },
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
        index: true,
      },
      is_active: {
        type: Boolean,
        default: true,
        index: true,
      },
      is_orderable: {
        type: Boolean,
        default: true,
      },
      priority: {
        type: Number,
        default: 100,
      },
      expected_order_quantity: {
        type: Number,
        default: 0,
        min: 0,
      },
      remarks: {
        type: String,
        trim: true,
      },
      created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      updated_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      deletedAt: {
        type: Date,
        default: null,
        index: true,
      },
    },
    {
      timestamps: true,
    }
  );
  partyProductMappingSchema.index(
    {
      party: 1,
      product: 1,
    },
    {
      unique: true,
    }
  );
  partyProductMappingSchema.plugin(softDeletePlugin);
  mongoose.model("PartyProductMapping", partyProductMappingSchema);

  // --- Schemas from PartyProductRate.js ---
  const partyProductRateSchema = new mongoose.Schema(
    {
      mapping: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PartyProductMapping",
        required: true,
        index: true,
      },
      party: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Party",
        required: true,
        index: true,
      },
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
        index: true,
      },
      rate_type: {
        type: String,
        enum: ["SR", "SRA", "CR"],
        required: true,
        index: true,
      },
      rate: {
        type: Number,
        required: true,
        min: 0,
      },
      min_qty: {
        type: Number,
        default: 1,
        min: 1,
      },
      max_qty: {
        type: Number,
        default: 999999,
      },
      validity_start: {
        type: Date,
        required: true,
        index: true,
      },
      validity_end: {
        type: Date,
        required: true,
        index: true,
      },
      priority: {
        type: Number,
        default: 100,
        index: true,
      },
      approval_required: {
        type: Boolean,
        default: false,
      },
      status: {
        type: String,
        enum: ["draft", "active", "expired", "cancelled"],
        default: "active",
        index: true,
      },
      remarks: {
        type: String,
        trim: true,
      },
      created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      approved_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      approved_at: Date,
      deletedAt: {
        type: Date,
        default: null,
        index: true,
      },
    },
    {
      timestamps: true,
    }
  );
  partyProductRateSchema.index({
    party: 1,
    product: 1,
    rate_type: 1,
    validity_start: -1,
  });
  partyProductRateSchema.index({
    validity_start: 1,
    validity_end: 1,
  });
  partyProductRateSchema.index({
    status: 1,
    rate_type: 1,
  });
  partyProductRateSchema.plugin(softDeletePlugin);
  mongoose.model("PartyProductRate", partyProductRateSchema);

  // --- Schemas from TransportAgent.js ---
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
      agent_name: { type: String, required: true, trim: true, index: true },
      agent_type: {
        type: String,
        enum: ['internal_fleet', 'third_party', 'courier'],
        required: true,
        index: true,
      },
      contact_person: { type: String, trim: true },
      mobile: { type: String, trim: true, index: true },
      alternate_mobile: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      gst_no: { type: String, trim: true, uppercase: true, index: true },
      pan_no: { type: String, trim: true, uppercase: true },
      payment_terms: { type: String, trim: true },
      address: {
        line1: String,
        line2: String,
        city: String,
        district: String,
        state: String,
        pincode: String,
        country: { type: String, default: 'India' },
      },
      service_areas: [{ state: String, district: String }],
      status: {
        type: String,
        enum: ['active', 'inactive', 'blacklisted'],
        default: 'active',
        index: true,
      },
      remarks: { type: String, trim: true },
      is_active: { type: Boolean, default: true, index: true },
      deletedAt: { type: Date, default: null, index: true },
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
  );
  transportAgentSchema.index({ agent_type: 1, status: 1 });
  transportAgentSchema.index({ agent_name: 1, is_active: 1 });
  transportAgentSchema.plugin(softDeletePlugin);
  mongoose.model('TransportAgent', transportAgentSchema);

  // --- Schemas from Vehicle.js ---
  const vehicleSchema = new mongoose.Schema(
    {
      vehicle_no: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
      transport_agent: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportAgent', index: true },
      vehicle_type: {
        type: String,
        enum: ['bike', 'three_wheeler', 'pickup', 'mini_truck', 'truck', 'container', 'other'],
        default: 'pickup',
        index: true,
      },
      ownership_type: {
        type: String,
        enum: ['owned', 'attached', 'rented', 'third_party'],
        default: 'owned',
        index: true,
      },
      status: {
        type: String,
        enum: ['available', 'assigned', 'in_transit', 'maintenance', 'inactive'],
        default: 'available',
        index: true,
      },
      make: { type: String, trim: true },
      model: { type: String, trim: true },
      capacity_kg: { type: Number, min: 0 },
      capacity_cft: { type: Number, min: 0 },
      insurance_expiry: Date,
      fitness_expiry: Date,
      pollution_expiry: Date,
      registration_expiry: Date,
      remarks: { type: String, trim: true },
      is_active: { type: Boolean, default: true, index: true },
      deletedAt: { type: Date, default: null, index: true },
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
  );
  vehicleSchema.index({ transport_agent: 1, status: 1 });
  vehicleSchema.plugin(softDeletePlugin);
  mongoose.model('Vehicle', vehicleSchema);

  // --- Schemas from Driver.js ---
  const driverSchema = new mongoose.Schema(
    {
      driver_code: { type: String, unique: true, sparse: true, uppercase: true, trim: true, index: true },
      name: { type: String, required: true, trim: true, index: true },
      phone: { type: String, required: true, trim: true, index: true },
      alternate_phone: { type: String, trim: true },
      transport_agent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TransportAgent',
        required: true,
        index: true,
      },
      assigned_vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', index: true },
      license_no: { type: String, trim: true, uppercase: true, index: true },
      license_type: { type: String, enum: ['LMV', 'HMV', 'MCWG', 'TRANSPORT', 'OTHER'] },
      license_expiry: { type: Date, index: true },
      aadhaar_no: { type: String, trim: true, select: false },
      joining_date: Date,
      emergency_contact_name: String,
      emergency_contact_phone: String,
      status: {
        type: String,
        enum: ['available', 'assigned', 'on_trip', 'leave', 'inactive'],
        default: 'available',
        index: true,
      },
      remarks: { type: String, trim: true },
      is_active: { type: Boolean, default: true, index: true },
      deletedAt: { type: Date, default: null, index: true },
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
  );
  driverSchema.index({ transport_agent: 1, status: 1 });
  driverSchema.plugin(softDeletePlugin);
  mongoose.model('Driver', driverSchema);

  // --- Schemas from Order.js ---
  const orderItemSchema = new mongoose.Schema(
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
        index: true,
      },
      product_name: {
        type: String,
        required: true,
        trim: true,
      },
      sku: String,
      brand: String,
      manufacturer: String,
      product_group: String,
      product_subgroup: String,
      unit: String,
      hsn_code: String,
      gst_percent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      ordered_quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      approved_quantity: {
        type: Number,
        default: 0,
        min: 0,
      },
      dispatched_quantity: {
        type: Number,
        default: 0,
        min: 0,
      },
      delivered_quantity: {
        type: Number,
        default: 0,
        min: 0,
      },
      returned_quantity: {
        type: Number,
        default: 0,
        min: 0,
      },
      line_status: {
        type: String,
        enum: ["active", "partial", "fulfilled", "cancelled"],
        default: "active",
        index: true,
      },
      free_quantity: {
        type: Number,
        default: 0,
        min: 0,
      },
      unit_price: {
        type: Number,
        required: true,
        min: 0,
      },
      applied_rate_type: {
        type: String,
        enum: ["SR", "SRA", "CR", "MANUAL"],
        default: "MANUAL",
      },
      pricing_reference: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PartyProductRate",
      },
      pricing_validity_start: Date,
      pricing_validity_end: Date,
      manual_price_override: {
        type: Boolean,
        default: false,
      },
      approval_required: {
        type: Boolean,
        default: false,
      },
      approval_reason: String,
      approved_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      approved_at: Date,
      discount_percent: {
        type: Number,
        default: 0,
      },
      discount_amount: {
        type: Number,
        default: 0,
      },
      taxable_amount: {
        type: Number,
        default: 0,
      },
      gst_amount: {
        type: Number,
        default: 0,
      },
      total_amount: {
        type: Number,
        default: 0,
      },
      remarks: String,
    },
    { _id: true, timestamps: true }
  );

  const orderSchema = new mongoose.Schema(
    {
      order_no: { type: String, required: true, unique: true, index: true },
      order_date: { type: Date, default: Date.now, index: true },
      expected_delivery_date: Date,
      priority: {
        type: String,
        enum: ["low", "normal", "high", "urgent"],
        default: "normal",
        index: true,
      },
      customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true },
      party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", index: true },
      status: {
        type: String,
        enum: [
          "draft",
          "submitted",
          "sales_approved",
          "finance_review",
          "finance_approved",
          "finance_rejected",
          "account_review",
          "account_approved",
          "account_rejected",
          "dispatch",
          "in_transit",
          "delivered",
          "closed",
          "cancelled",
          "on_hold",
        ],
        default: "draft",
        index: true,
      },
      lifecycle_status: {
        type: String,
        enum: [
          "draft",
          "active",
          "partially_fulfilled",
          "fulfilled",
          "cancelled",
          "closed",
          "on_hold",
        ],
        default: "draft",
        index: true,
      },
      workflow_stage: {
        type: String,
        enum: [
          "sales",
          "admin_review",
          "finance_review",
          "account_review",
          "dispatch",
          "completed",
          "cancelled",
          "on_hold",
        ],
        default: "sales",
        index: true,
      },
      current_action: { type: String, default: "drafted", index: true },
      current_revision: { type: Number, default: 1 },
      is_locked: { type: Boolean, default: false },
      current_assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
      assigned_sales_user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
      current_department: {
        type: String,
        enum: ["super_admin", "sales", "admin", "finance", "account", "dispatch"],
        index: true,
      },
      pending_with_role: {
        type: String,
        enum: ["super_admin", "sales", "admin", "finance", "account", "dispatch"],
        index: true,
      },
      subtotal: { type: Number, default: 0 },
      discount_amount: { type: Number, default: 0 },
      taxable_amount: { type: Number, default: 0 },
      gst_amount: { type: Number, default: 0 },
      grand_total: { type: Number, default: 0 },
      payment_status: {
        type: String,
        enum: ["unpaid", "partial", "paid"],
        default: "unpaid",
        index: true,
      },
      finance_approval_status: {
        type: String,
        enum: ["pending", "partial", "approved", "rejected", "full"],
        default: "pending",
        index: true,
      },
      last_finance_approval: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OrderApproval",
        index: true,
      },
      admin_approval_status: {
        type: String,
        enum: ["pending", "partial", "approved", "rejected", "sent_to_finance"],
        default: "pending",
        index: true,
      },
      last_admin_approval: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OrderApproval",
        index: true,
      },
      account_approval_status: {
        type: String,
        enum: ["pending", "partial", "approved", "rejected", "full"],
        default: "pending",
        index: true,
      },
      last_account_approval: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OrderApproval",
        index: true,
      },
      allocation_status: {
        type: String,
        enum: ["pending", "partial", "completed"],
        default: "pending",
      },
      dispatch_status: {
        type: String,
        enum: ["pending", "partial", "completed"],
        default: "pending",
      },
      delivery_status: {
        type: String,
        enum: ["pending", "partial", "completed"],
        default: "pending",
      },
      extra_charges: { type: Number, default: 0, min: 0 },
      penalty_amount: { type: Number, default: 0, min: 0 },
      damage_charge: { type: Number, default: 0, min: 0 },
      closed_at: Date,
      closed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
      closure_remarks: String,
      order_items: {
        type: [orderItemSchema],
        validate: {
          validator: (items) => items.length > 0,
          message: "Order must contain at least one item.",
        },
      },
      has_open_flags: { type: Boolean, default: false, index: true },
      open_flag_count: { type: Number, default: 0 },
      highest_flag_severity: {
        type: String,
        enum: ["none", "low", "medium", "high", "critical"],
        default: "none",
      },
      remarks: String,
      internal_notes: String,
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
      updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
  );

  orderSchema.index({ customer: 1, order_date: -1 });
  orderSchema.index({ workflow_stage: 1, lifecycle_status: 1 });
  orderSchema.index({ current_assignee: 1, workflow_stage: 1 });
  orderSchema.index({ status: 1, closed_at: -1 });

  orderSchema.plugin(softDeletePlugin);
  mongoose.model("Order", orderSchema);

  // --- Schemas from OrderWorkflow.js ---
  /**
   * Immutable workflow event log — current state lives on Order; this is append-only history.
   * @see models/OrderWorkflow.js
   */
  const orderWorkflowSchema = new mongoose.Schema(
    {
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
      action_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
      role: {
        type: String,
        enum: ["super_admin", "sales", "admin", "finance", "account", "dispatch"],
        required: true,
        index: true,
      },
      action: { type: String, required: true, index: true },
      from_stage: { type: String, index: true },
      to_stage: { type: String, index: true },
      from_status: { type: String, index: true },
      to_status: { type: String, index: true },
      reason_code: String,
      remarks: String,
      internal_notes: String,
      revision_number: { type: Number, default: 1 },
      metadata: { type: mongoose.Schema.Types.Mixed },
      ip_address: String,
      user_agent: String,
      created_at: { type: Date, default: Date.now, index: true },
    },
    { timestamps: false }
  );
  orderWorkflowSchema.index({ order: 1, created_at: -1 });
  mongoose.model("OrderWorkflow", orderWorkflowSchema);



  // --- Schemas from OrderStatusHistory.js ---
  /**
   * @fileoverview ESM mongoose mirror for OrderStatusHistory (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/OrderStatusHistory
   */
  
  
  const orderStatusHistorySchema = new mongoose.Schema(
    {
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  
      from_status: String,
      to_status: { type: String, required: true },
  
      changed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  
      remarks: String,
    },
    { timestamps: true }
  );
  
  mongoose.model("OrderStatusHistory", orderStatusHistorySchema);

  // --- Schemas from OrderApproval.js ---
  /**
   * @fileoverview ESM mongoose mirror for OrderApproval (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/OrderApproval
   */
  
  
  const orderApprovalSchema = new mongoose.Schema(
    {
      approval_no: { type: String, unique: true, sparse: true, index: true },
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
      revision_number: { type: Number, default: 1, index: true },


      ordered_total_amount: { type: Number },
      approved_total_amount: { type: Number, default: 0 },
      rejected_total_amount: { type: Number, default: 0 },

      // Decisions/Signatures for Sales/Admin
      is_admin_approved: { type: Boolean, default: false },
      admin_approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      admin_approved_at: Date,

      // Decisions/Signatures for Finance
      is_finance_approved: { type: Boolean, default: false },
      finance_approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      finance_approved_at: Date,

      // Decisions/Signatures for Account
      is_account_approved: { type: Boolean, default: false },
      account_approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      account_approved_at: Date,

      // Operational properties
      rates_reviewed: { type: Boolean, default: false },
      all_rates_mapped: { type: Boolean, default: false },
      credit_limit_checked: { type: Boolean, default: false },
      outstanding_checked: { type: Boolean, default: false },
      risk_level: { type: String, enum: ["low", "medium", "high", "critical"], default: "low" },
      approval_notes: String,
      rejection_reason: String,
      hold_reason: String,

      assigned_finance_user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
      assigned_account_user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
      sent_to_finance_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      sent_to_finance_at: Date,
      sent_to_account_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      sent_to_account_at: Date,
      reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewed_at: Date,
      finance_amended: { type: Boolean, default: false },
      finance_amended_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      finance_amended_at: Date,
      account_amended: { type: Boolean, default: false },
      account_amended_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      account_amended_at: Date,
      admin_amended: { type: Boolean, default: false },
      admin_amended_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      admin_amended_at: Date,
      dispatch_release_resolved: { type: Boolean, default: false, index: true },
      dispatch_release_resolved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      dispatch_release_resolved_at: Date,

      // Detailed line items being approved
      approval_items: [
        {
          order_item_id: { type: mongoose.Schema.Types.ObjectId, required: true },
          product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
          ordered_quantity: { type: Number, required: true },
          ordered_unit_price: { type: Number, required: true },
          ordered_total_amount: { type: Number, required: true },
          approved_quantity: { type: Number, default: 0 },
          approved_unit_price: { type: Number, default: 0 },
          approved_total_amount: { type: Number, default: 0 },

          applied_rate_type: { type: String, default: "SR" },
          pricing_reference: { type: mongoose.Schema.Types.ObjectId, ref: "PartyProductRate" },
          manual_price_override: { type: Boolean, default: false },
          rate_mapped: { type: Boolean, default: false },
          discount_percent: { type: Number, default: 0 },
          discount_amount: { type: Number, default: 0 },
          gst_percent: { type: Number, default: 0 },
          free_quantity: { type: Number, default: 0 },
          remarks: String,
        }
      ],

      approved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      approved_at: Date,
      rejected_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rejected_at: Date,
      remarks: String,
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
  );

  orderApprovalSchema.index({ order: 1, revision_number: -1 });
  orderApprovalSchema.plugin(softDeletePlugin);
  mongoose.model("OrderApproval", orderApprovalSchema);

  const orderAmmendmentUserSchema = new mongoose.Schema(
    {
      order_approval: { type: mongoose.Schema.Types.ObjectId, ref: "OrderApproval", required: true, index: true },
      department: {
        type: String,
        enum: ["admin", "finance", "account"],
        required: true,
        index: true,
      },
      ammended_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
      ammended_at: { type: Date, default: Date.now },
    },
    { timestamps: true }
  );

  mongoose.model("OrderAmmendmentUser", orderAmmendmentUserSchema);

  // --- Schemas from OrderFlag.js ---
  /**
   * @fileoverview ESM mongoose mirror for OrderFlag (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/OrderFlag
   */
  
  
  const orderFlagSchema = new mongoose.Schema(
    {
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  
      flag_type: {
        type: String,
        enum: [
          "urgent",
          "dispatch_issue",
          "stock_issue",
          "customer_issue",
          "document_missing",
          "approval_delay",
          "vehicle_issue",
        ],
        required: true,
      },
  
      severity: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        default: "medium",
      },
  
      title: { type: String, required: true },
      description: String,
  
      blocks_order: { type: Boolean, default: false },
  
      status: {
        type: String,
        enum: ["open", "in_progress", "resolved", "dismissed"],
        default: "open",
        index: true,
      },
  
      department: {
        type: String,
        enum: ["sales", "finance", "account", "dispatch"],
      },
  
      raised_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  
      due_date: Date,
  
      resolved_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      resolved_at: Date,
  
      resolution_note: String,
    },
    { timestamps: true }
  );
  
  mongoose.model("OrderFlag", orderFlagSchema);



  // --- Schemas from Attachment.js ---
  /**
   * @fileoverview ESM mongoose mirror for Attachment (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/Attachment
   */
  
  
  const attachmentSchema = new mongoose.Schema(
    {
      original_name: { type: String, required: true },
      file_name: { type: String, required: true },
  
      mime_type: { type: String, required: true },
      size: { type: Number, required: true },
  
      storage_provider: {
        type: String,
        enum: ["local", "s3", "minio"],
        default: "local",
      },
  
      bucket: String,
      key: String,
      url: String,
  
      entity_type: {
        type: String,
        enum: [
          "order",
          "dispatch",
          "transport",
          "customer",
          "driver",
          "vehicle",
          "transport_agent",
          "delivery",
          "return",
          "order_due_sheet",
        ],
        required: true,
      },
  
      entity_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true,
      },
  
      uploaded_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
  
      remarks: {
        type: String,
        default: "",
      },
  
      deletedAt: {
        type: Date,
        default: null,
        index: true,
      },
    },
    { timestamps: true }
  );
  
  attachmentSchema.plugin(softDeletePlugin);
  mongoose.model("Attachment", attachmentSchema);

  // --- Schemas from OrderDispatch.js ---
  const dispatchItemSchema = new mongoose.Schema(
    {
      order_item_id: { type: mongoose.Schema.Types.ObjectId, required: true },
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      batch: { type: mongoose.Schema.Types.ObjectId, ref: "Batch" },
      allocated_quantity: { type: Number, required: true, min: 0 },
      dispatched_quantity: { type: Number, required: true, min: 0 },
      delivered_quantity: { type: Number, default: 0 },
      returned_quantity: { type: Number, default: 0 },
      remarks: String,
    },
    { _id: true }
  );
  
  const orderDispatchSchema = new mongoose.Schema(
    {
      dispatch_no: { type: String, required: true, unique: true, index: true },
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
      finance_approval: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OrderApproval",
        index: true,
      },
      warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
      warehouse_location: String,
      dispatch_status: {
        type: String,
        enum: [
          "draft",
          "allocation_pending",
          "allocated",
          "packing",
          "partially_dispatched",
          "fully_dispatched",
          "cancelled",
        ],
        default: "draft",
        index: true,
      },
      dispatch_items: [dispatchItemSchema],
      packed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      dispatched_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      dispatch_assignee_user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
      packed_at: Date,
      dispatched_at: Date,
      bill_number: String,
      billing_date: Date,
      bill_document: { type: mongoose.Schema.Types.ObjectId, ref: "Attachment" },
      remarks: String,
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true }
  );

  orderDispatchSchema.plugin(softDeletePlugin);
  mongoose.model("OrderDispatch", orderDispatchSchema);

  // --- Schemas from TransportShipment.js ---
  const transportShipmentSchema = new mongoose.Schema(
    {
      shipment_no: { type: String, required: true, unique: true, index: true },
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
      dispatch: { type: mongoose.Schema.Types.ObjectId, ref: "OrderDispatch", required: true, index: true },
      transport_agent: { type: mongoose.Schema.Types.ObjectId, ref: "TransportAgent", index: true },
      transporter: { type: mongoose.Schema.Types.ObjectId, ref: "Transporter" },
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
      weight_unit: { type: String, default: "Kg" },
      packed_boxes: Number,
      open_boxes: Number,
      total_quantity: Number,
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true }
  );

  transportShipmentSchema.plugin(softDeletePlugin);
  mongoose.model("TransportShipment", transportShipmentSchema);

  const orderDeliveryItemSchema = new mongoose.Schema(
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      delivered_quantity: { type: Number, required: true, min: 0 },
      remarks: String,
    },
    { _id: true }
  );

  const orderDeliverySchema = new mongoose.Schema(
    {
      delivery_no: { type: String, required: true, unique: true, index: true },
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
      dispatch: { type: mongoose.Schema.Types.ObjectId, ref: "OrderDispatch", required: true, index: true },
      transport: { type: mongoose.Schema.Types.ObjectId, ref: "TransportShipment", index: true },
      delivery_status: {
        type: String,
        enum: ["pending", "delivered", "failed", "returned"],
        default: "pending",
        index: true,
      },
      delivery_items: [orderDeliveryItemSchema],
      delivered_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      delivered_at: Date,
      actual_delivery_date: Date,
      received_by: String,
      delivery_proof_url: String,
      remarks: String,
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
  );

  orderDeliverySchema.plugin(softDeletePlugin);
  mongoose.model("OrderDelivery", orderDeliverySchema);

  const orderReturnItemSchema = new mongoose.Schema(
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      returned_quantity: { type: Number, required: true, min: 1 },
      return_reason: String,
      remarks: String,
      expiry_type: {
        type: String,
        enum: ["expiry", "other"],
        default: "other",
      },
      expiry_date: Date,
    },
    { _id: true }
  );

  const orderReturnSchema = new mongoose.Schema(
    {
      return_no: { type: String, required: true, unique: true, index: true },
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
      dispatch: { type: mongoose.Schema.Types.ObjectId, ref: "OrderDispatch", index: true },
      transport: { type: mongoose.Schema.Types.ObjectId, ref: "TransportShipment", index: true },
      delivery: { type: mongoose.Schema.Types.ObjectId, ref: "OrderDelivery", index: true },
      return_status: {
        type: String,
        enum: ["pending", "received_at_warehouse"],
        default: "pending",
        index: true,
      },
      return_items: [orderReturnItemSchema],
      returned_by: String,
      received_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      received_at: Date,
      order_closed_at: Date,
      remarks: String,
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
  );

  orderReturnSchema.plugin(softDeletePlugin);
  mongoose.model("OrderReturn", orderReturnSchema);

  const orderDueSheetSchema = new mongoose.Schema(
    {
      due_sheet_no: { type: String, required: true, unique: true, index: true },
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
      document: { type: mongoose.Schema.Types.ObjectId, ref: "Attachment", required: true },
      sheet_date: { type: Date, default: Date.now },
      revision_number: { type: Number, default: 1, min: 1 },
      is_current: { type: Boolean, default: true, index: true },
      status: {
        type: String,
        enum: ["active", "superseded", "archived"],
        default: "active",
        index: true,
      },
      remarks: String,
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
  );

  orderDueSheetSchema.index({ order: 1, is_current: 1 });
  orderDueSheetSchema.plugin(softDeletePlugin);
  mongoose.model("OrderDueSheet", orderDueSheetSchema);

  // --- Schemas from ActivityLog.js ---
  /**
   * @fileoverview ESM mongoose mirror for ActivityLog (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/ActivityLog
   */
  
  
  const activityLogSchema = new mongoose.Schema(
    {
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  
      entity_type: {
        type: String,
        required: true,
        enum: [
          "user",
          "customer",
          "party",
          "product",
          "order",
          "approval",
          "flag",
          "dispatch",
          "transport",
          "vehicle",
          "driver",
          "attachment",
          "delivery",
          "return",
          "order_due_sheet",
        ],
      },
  
      entity_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  
      action: {
        type: String,
        required: true,
        enum: [
          "created",
          "updated",
          "deleted",
          "submitted",
          "approved",
          "rejected",
          "assigned",
          "status_changed",
          "flagged",
          "resolved",
          "uploaded",
          "generated",
          "cancelled",
        ],
      },
  
      message: { type: String, required: true },
  
      old_value: mongoose.Schema.Types.Mixed,
      new_value: mongoose.Schema.Types.Mixed,
  
      ip_address: String,
      user_agent: String,
    },
    { timestamps: true }
  );
  
  mongoose.model("ActivityLog", activityLogSchema);

  // --- Schemas from Notification.js ---
  /**
   * @fileoverview ESM mongoose mirror for Notification (canonical runtime schemas live in data/mongoRegistry.js).
   * @module models/Notification
   */
  
  
  const notificationSchema = new mongoose.Schema(
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  
      title: { type: String, required: true },
      message: { type: String, required: true },
  
      type: {
        type: String,
        enum: ["info", "success", "warning", "error"],
        default: "info",
      },
  
      module: {
        type: String,
        enum: [
          "order",
          "finance",
          "dispatch",
          "transport",
          "flag",
          "system",
        ],
        default: "system",
      },
  
      entity_type: String,
      entity_id: mongoose.Schema.Types.ObjectId,
  
      is_read: { type: Boolean, default: false },
      read_at: Date,
    },
    { timestamps: true }
  );
  
  mongoose.model("Notification", notificationSchema);

  // --- Schemas for Message ---
  const messageSchema = new mongoose.Schema(
    {
      recipient: { type: String, required: true, index: true },
      channel: { type: String, enum: ['email', 'whatsapp'], required: true, index: true },
      status: {
        type: String,
        enum: ['pending', 'queued', 'sending', 'sent', 'failed'],
        default: 'pending',
        index: true,
      },
      subject: { type: String },
      body: { type: String },
      templateName: { type: String },
      templateParams: { type: mongoose.Schema.Types.Mixed },
      error: { type: String },
      attempts: { type: Number, default: 0 },
      metadata: { type: mongoose.Schema.Types.Mixed },
      sentAt: { type: Date },
      failedAt: { type: Date },
    },
    { timestamps: true }
  );

  mongoose.model("Message", messageSchema);

  // --- Schemas for Reminder ---
  const followUpSchema = new mongoose.Schema(
    {
      followup_date: { type: Date, required: true },
      remarks: { type: String, required: true, trim: true },
      status: {
        type: String,
        enum: ["pending", "completed", "cancelled"],
        default: "pending",
      },
      created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { _id: true, timestamps: true }
  );

  const reminderSchema = new mongoose.Schema(
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
      order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
      party: { type: mongoose.Schema.Types.ObjectId, ref: "Party", index: true },

      follow_ups: { type: [followUpSchema], default: [] },

      next_followup_date: { type: Date, index: true },

      status: {
        type: String,
        enum: ["active", "completed", "dismissed"],
        default: "active",
        index: true,
      },
      deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
  );

  reminderSchema.plugin(softDeletePlugin);
  mongoose.model("Reminder", reminderSchema);


  // --- Apply plugins ---
  // Plugins are applied immediately after schema definitions to ensure correct compilation of models.

  return {
    Permission: mongoose.models.Permission || mongoose.model('Permission', permissionSchema),
    Role: mongoose.models.Role || mongoose.model('Role', roleSchema),
    User: mongoose.models.User || mongoose.model('User', userSchema),
    Customer: mongoose.models.Customer || mongoose.model('Customer', customerSchema),
    Warehouse: mongoose.models.Warehouse || mongoose.model('Warehouse', warehouseSchema),
    Party: mongoose.models.Party || mongoose.model('Party', partySchema),
    Batch: mongoose.models.Batch || mongoose.model('Batch', batchSchema),
    PartyProductLastRate:
      mongoose.models.PartyProductLastRate || mongoose.model('PartyProductLastRate', partyProductLastRateSchema),
    Product: mongoose.models.Product || mongoose.model('Product', productSchema),
    TransportAgent:
      mongoose.models.TransportAgent || mongoose.model('TransportAgent', transportAgentSchema),
    Vehicle: mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema),
    Driver: mongoose.models.Driver || mongoose.model('Driver', driverSchema),
    Order: mongoose.models.Order || mongoose.model('Order', orderSchema),
    OrderWorkflow: mongoose.models.OrderWorkflow || mongoose.model('OrderWorkflow', orderWorkflowSchema),
    OrderStatusHistory:
      mongoose.models.OrderStatusHistory || mongoose.model('OrderStatusHistory', orderStatusHistorySchema),
    OrderApproval: mongoose.models.OrderApproval || mongoose.model('OrderApproval', orderApprovalSchema),
    OrderAmmendmentUser:
      mongoose.models.OrderAmmendmentUser || mongoose.model('OrderAmmendmentUser', orderAmmendmentUserSchema),
    OrderFlag: mongoose.models.OrderFlag || mongoose.model('OrderFlag', orderFlagSchema),
    Attachment: mongoose.models.Attachment || mongoose.model('Attachment', attachmentSchema),
    OrderDispatch: mongoose.models.OrderDispatch || mongoose.model('OrderDispatch', orderDispatchSchema),
    TransportShipment:
      mongoose.models.TransportShipment || mongoose.model('TransportShipment', transportShipmentSchema),
    OrderDelivery: mongoose.models.OrderDelivery || mongoose.model('OrderDelivery', orderDeliverySchema),
    OrderReturn: mongoose.models.OrderReturn || mongoose.model('OrderReturn', orderReturnSchema),
    OrderDueSheet: mongoose.models.OrderDueSheet || mongoose.model('OrderDueSheet', orderDueSheetSchema),
    ActivityLog: mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema),
    Notification: mongoose.models.Notification || mongoose.model('Notification', notificationSchema),
    Message: mongoose.models.Message || mongoose.model('Message', messageSchema),
    Reminder: mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema),
    PartyProductMapping:
      mongoose.models.PartyProductMapping || mongoose.model('PartyProductMapping', partyProductMappingSchema),
    PartyProductRate:
      mongoose.models.PartyProductRate || mongoose.model('PartyProductRate', partyProductRateSchema),
  };
}

/** @typedef {NonNullable<typeof _cached>} MongoModelsRegistry */

/** @returns {MongoModelsRegistry} */
function getModels() {
  if (!_cached) _cached = registerModels();
  return _cached;
}

/** @deprecated Prefer getModels(); kept for mongoSyncUsers + mongoUserBridge */
function getMongoModels() {
  const all = getModels();
  const { Permission, Role, User } = all;
  return { Permission, Role, User };
}

module.exports = {
  getModels,
  getMongoModels,
};
