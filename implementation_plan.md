# Centralized Order Approvals Refactoring

We unified the database schemas for order approvals by removing `OrderAdminApproval` and `OrderFinanceApproval` models, and replacing them with a central `OrderApproval` model and a new `OrderAmmendmentUser` model. This simplifies the data model and centralizes all approval statuses (sales/admin, finance, and account) under a single unified document structure per order.

---

## Migration Choice

We executed **Option 1 (Database-Only Unification with API Aliasing)**:
- We unified the database models completely, deleted the old model files, and updated references in schemas (`Order`, `OrderDispatch`).
- Kept `/api/order-admin-approvals` and `/api/order-finance-approvals` routes fully active and functional.
- Removed legacy fields `department`, `approval_type`, and `status` from `OrderApproval` schema. The record is now unique and shared per order.
- Internally, these routers query and update the same unified `OrderApproval` document directly, using signature flags like `is_admin_approved` and `is_finance_approved` instead of a separate table field.
- This keeps the database layout clean while maintaining absolute compatibility with the frontend.

---

## Proposed Database Schemas

### 1. Unified `OrderApproval` Model
Stores the centralized approval details, decision signatures, and line-item snapshots for sales/admin, finance, and account.

```javascript
const orderApprovalSchema = new mongoose.Schema(
  {
    approval_no: { type: String, unique: true, sparse: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    revision_number: { type: Number, default: 1, index: true },
    approval_status: {
      type: String,
      enum: ["draft", "pending_review", "approved", "rejected", "hold", "cancelled", "partially_approved", "fully_approved"],
      default: "draft",
      index: true,
    },

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
        approval_status: {
          type: String,
          enum: ["pending", "partially_approved", "fully_approved", "rejected", "hold"],
          default: "pending",
        },
        applied_rate_type: { type: String, default: "MANUAL" },
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
```

### 2. New `OrderAmmendmentUser` Model
Tracks amendments on approval documents.

```javascript
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
```

---

## File Changes

### Backend Updates

#### [DELETE] `OrderAdminApproval.js`
- Removed separate legacy schema file.

#### [DELETE] `OrderFinanceApproval.js`
- Removed separate legacy schema file.

#### [MODIFY] [OrderApproval.js](file:///Users/macbook/Desktop/medica-opms-main/backend/src/models/OrderApproval.js)
- Overwritten with the unified `OrderApproval` schema mirror, excluding legacy `department`, `approval_type`, and `status`.

#### [NEW] [OrderAmmendmentUser.js](file:///Users/macbook/Desktop/medica-opms-main/backend/src/models/OrderAmmendmentUser.js)
- Created model schema mirror.

#### [MODIFY] [mongoRegistry.js](file:///Users/macbook/Desktop/medica-opms-main/backend/src/data/mongoRegistry.js)
- Registered the unified `OrderApproval` (without legacy fields) and `OrderAmmendmentUser` schemas.

#### [MODIFY] [orderAdminApproval.service.js](file:///Users/macbook/Desktop/medica-opms-main/backend/src/modules/orderAdminApproval/orderAdminApproval.service.js)
- Rewrote queries and db writes to point to `OrderApproval` per order, without filtering on `department`.
- Log amendments under `OrderAmmendmentUser` collection (`order_approval`, `department: 'finance'`, `ammended_by`, `ammended_at`).

#### [MODIFY] [orderFinanceApproval.service.js](file:///Users/macbook/Desktop/medica-opms-main/backend/src/modules/orderFinanceApproval/orderFinanceApproval.service.js)
- Rewrote queries and db writes to point to the existing `OrderApproval` document per order, without filtering on `department`.
- Log amendments under `OrderAmmendmentUser` collection (`order_approval`, `department: 'account'`, `ammended_by`, `ammended_at`).

#### [MODIFY] [orderFulfillment.service.js](file:///Users/macbook/Desktop/medica-opms-main/backend/src/modules/orders/orderFulfillment.service.js)
- Updated `recomputeApprovedQuantitiesFromFinance` to query `OrderApproval` without filtering on `department`.

#### [MODIFY] [Order.js](file:///Users/macbook/Desktop/medica-opms-main/backend/src/models/Order.js) and [OrderDispatch.js](file:///Users/macbook/Desktop/medica-opms-main/backend/src/models/OrderDispatch.js)
- Updated schema field types pointing to the unified `OrderApproval` model.

---

## Verification Plan

### Automated Tests
- Run `npx tsc --noEmit` on the frontend.
