/**
 * @fileoverview Service layer for Company Info operations & Parent Data aggregation
 * @module modules/companyInfo/companyInfo.service
 */
const { getModels } = require('../../data/mongoRegistry');
const { DEFAULT_COMPANY_DATA } = require('./companyInfo.constants');

/**
 * Retrieves the current default company info record, creating one if not exists.
 * @returns {Promise<Record<string, unknown>>}
 */
async function getCompanyInfo() {
  const { CompanyInfo } = getModels();

  let doc = await CompanyInfo.findOne({ is_default: true }).lean();
  if (!doc) {
    doc = await CompanyInfo.create(DEFAULT_COMPANY_DATA);
    doc = doc.toObject ? doc.toObject() : doc;
  }
  return doc;
}

/**
 * Updates the company info record.
 * @param {Record<string, unknown>} patch 
 * @param {Record<string, unknown>} user 
 * @returns {Promise<Record<string, unknown>>}
 */
async function updateCompanyInfo(patch, user) {
  const { CompanyInfo } = getModels();

  const allowedKeys = [
    'legal_name',
    'trade_name',
    'gstin',
    'cin',
    'pan',
    'drug_license',
    'fssai_license',
    'email',
    'billing_email',
    'phone',
    'website',
    'logo_url',
    'favicon_url',
    'primary_color',
    'secondary_color',
    'theme_palette',
    'address',
    'city',
    'state',
    'pincode',
    'country',
    'currency',
    'timezone',
    'financial_year',
    'invoice_footer_note',
    'bank_name',
    'account_name',
    'account_number',
    'ifsc_code',
    'branch_name',
    'account_type',
    'upi_id',
    'swift_code',
    'quotation_terms',
  ];

  const updateFields = {};
  for (const key of allowedKeys) {
    if (patch[key] !== undefined) {
      if (typeof patch[key] === 'string') {
        updateFields[key] = patch[key].trim();
      } else {
        updateFields[key] = patch[key];
      }
    }
  }

  if (user && user._id) {
    updateFields.updated_by = user._id;
  }

  let doc = await CompanyInfo.findOneAndUpdate(
    { is_default: true },
    { $set: updateFields },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return doc;
}

/**
 * Aggregates all data belonging to the parent company across all system domains.
 * @returns {Promise<Record<string, unknown>>}
 */
async function getCompanyAggregatedData() {
  const models = getModels();
  const {
    CompanyInfo,
    User,
    Party,
    Product,
    ProductGroup,
    ProductBrand,
    ProductManufacturer,
    Order,
    Vehicle,
    Driver,
    TransportAgent,
    TransportPlan,
    WorkPlan,
    WorkPlanVisit,
    WorkPlanExpense,
    OrderDueSheet,
    UnbilledOrder,
    ActivityLog,
  } = models;

  const company = await getCompanyInfo();

  // Run queries in parallel utilizing Mongoose query hooks (excluding soft-deleted rows and drafts)
  const [
    activeUserList,
    activePartyList,
    totalProducts,
    activeProducts,
    totalGroups,
    totalBrands,
    totalManufacturers,
    orderList,
    totalVehicles,
    totalDrivers,
    totalTransportAgents,
    activeTransportPlans,
    totalWorkPlans,
    totalWorkPlanVisits,
    expensesList,
    totalDueSheets,
    totalUnbilledOrders,
    recentActivity,
  ] = await Promise.all([
    User ? User.find({ is_active: { $ne: false } }).select('department').lean() : [],
    Party ? Party.find({ is_active: { $ne: false } }).select('party_type').lean() : [],
    Product ? Product.countDocuments({ is_active: { $ne: false } }) : 0,
    Product ? Product.countDocuments({ is_active: { $ne: false } }) : 0,
    ProductGroup ? ProductGroup.countDocuments({}) : 0,
    ProductBrand ? ProductBrand.countDocuments({}) : 0,
    ProductManufacturer ? ProductManufacturer.countDocuments({}) : 0,
    Order ? Order.find({ status: { $ne: 'draft' } }).select('order_no total_amount status order_date createdAt').sort({ createdAt: -1 }).lean() : [],
    Vehicle ? Vehicle.countDocuments({ is_active: { $ne: false } }) : 0,
    Driver ? Driver.countDocuments({ is_active: { $ne: false } }) : 0,
    TransportAgent ? TransportAgent.countDocuments({ is_active: { $ne: false } }) : 0,
    TransportPlan ? TransportPlan.countDocuments({ status: { $in: ['planned', 'submitted', 'in_transit'] } }) : 0,
    WorkPlan ? WorkPlan.countDocuments({}) : 0,
    WorkPlanVisit ? WorkPlanVisit.countDocuments({}) : 0,
    WorkPlanExpense ? WorkPlanExpense.find({}).select('amount').lean() : [],
    OrderDueSheet ? OrderDueSheet.countDocuments({ is_current: true }) : 0,
    UnbilledOrder ? UnbilledOrder.countDocuments({ status: 'open' }) : 0,
    ActivityLog ? ActivityLog.find().sort({ createdAt: -1 }).limit(6).populate('actor', 'name email department').lean() : [],
  ]);

  // Format department map from active users
  const departmentBreakdown = {
    super_admin: 0,
    admin: 0,
    sales: 0,
    finance: 0,
    account: 0,
    dispatch: 0,
  };
  for (const u of activeUserList) {
    const dept = u.department;
    if (dept && departmentBreakdown[dept] !== undefined) {
      departmentBreakdown[dept] += 1;
    }
  }

  // Format party types map from active non-deleted parties
  const partyTypeBreakdown = {
    customer: 0,
    supplier: 0,
    both: 0,
  };
  for (const p of activePartyList) {
    const pt = p.party_type;
    if (pt && partyTypeBreakdown[pt] !== undefined) {
      partyTypeBreakdown[pt] += 1;
    }
  }

  // Format order status map & total revenue from active non-deleted orders
  const orderStatusBreakdown = {};
  let totalOrderRevenue = 0;
  for (const o of orderList) {
    if (o.status) {
      orderStatusBreakdown[o.status] = (orderStatusBreakdown[o.status] || 0) + 1;
    }
    if (typeof o.total_amount === 'number' && !isNaN(o.total_amount)) {
      totalOrderRevenue += o.total_amount;
    }
  }

  // Sum active field expenses
  let totalFieldExpenses = 0;
  for (const exp of expensesList) {
    if (typeof exp.amount === 'number' && !isNaN(exp.amount)) {
      totalFieldExpenses += exp.amount;
    }
  }

  const recentOrders = orderList.slice(0, 5);

  return {
    company_info: company,
    metrics: {
      users: {
        total: activeUserList.length,
        active: activeUserList.length,
        departments: departmentBreakdown,
      },
      parties: {
        total: activePartyList.length,
        active: activePartyList.length,
        by_type: partyTypeBreakdown,
      },
      catalog: {
        total_products: totalProducts,
        active_products: activeProducts,
        total_groups: totalGroups,
        total_brands: totalBrands,
        total_manufacturers: totalManufacturers,
      },
      orders: {
        total: orderList.length,
        total_revenue: totalOrderRevenue,
        by_status: orderStatusBreakdown,
        recent: recentOrders,
      },
      fleet: {
        vehicles: totalVehicles,
        drivers: totalDrivers,
        transport_agents: totalTransportAgents,
        active_transport_plans: activeTransportPlans,
      },
      field_operations: {
        work_plans: totalWorkPlans,
        visits: totalWorkPlanVisits,
        total_expenses: totalFieldExpenses,
      },
      financials: {
        total_due_sheets: totalDueSheets,
        unbilled_orders: totalUnbilledOrders,
        estimated_revenue: totalOrderRevenue,
      },
      recent_activity: recentActivity,
    },
  };
}

module.exports = {
  getCompanyInfo,
  updateCompanyInfo,
  getCompanyAggregatedData,
};
