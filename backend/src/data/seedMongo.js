/**
 * @fileoverview Boot-time seed/bootstrap orchestration.
 * @module data/seedMongo
 */
const { syncExampleUsersToMongo } = require('./mongoSyncUsers');
const { getModels } = require('./mongoRegistry');
const { logger } = require('../config/logger');

const SAMPLE_PARTIES = Object.freeze([
  {
    party_type: 'customer',
    party_name: 'Apollo Pharmacy',
    contact_person: 'Procurement Desk',
    gst_no: '27AAAAA0000A1Z5',
    email: 'procurement@apollo.example',
    mobile: '+919800000001',
    district: 'Mumbai',
    state: 'MH',
    payment_terms: 'Net 30',
    billing_address: {
      address_line_1: 'Plot 5',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
      country: 'India',
    },
    shipping_address: {
      address_line_1: 'Warehouse 2',
      city: 'Thane',
      state: 'MH',
      pincode: '401105',
      country: 'India',
    },
  },
  {
    party_type: 'customer',
    party_name: 'CityCare Hospital',
    contact_person: 'Stores Manager',
    gst_no: '27AAACC1111A1Z8',
    email: 'stores@citycare.example',
    mobile: '+919800000002',
    district: 'Pune',
    state: 'MH',
    payment_terms: 'Net 15',
  },
  {
    party_type: 'customer',
    party_name: 'MedLife Retail Chain',
    contact_person: 'Anita Sharma',
    gst_no: '29AAACM2222A1Z7',
    email: 'purchase@medlife.example',
    mobile: '+919800000003',
    district: 'Bengaluru',
    state: 'KA',
    payment_terms: 'Net 30',
  },
  {
    party_type: 'supplier',
    party_name: 'HealthPlus Distributors',
    contact_person: 'Ramesh Iyer',
    gst_no: '24AAACH3333A1Z6',
    email: 'sales@healthplus.example',
    mobile: '+919800000004',
    district: 'Ahmedabad',
    state: 'GJ',
    payment_terms: 'Advance',
  },
  {
    party_type: 'supplier',
    party_name: 'Zenith Surgical Supplies',
    contact_person: 'Meera Nair',
    gst_no: '33AAACZ4444A1Z5',
    email: 'orders@zenithsurgical.example',
    mobile: '+919800000005',
    district: 'Chennai',
    state: 'TN',
    payment_terms: 'Net 7',
  },
  {
    party_type: 'both',
    party_name: 'NorthStar Pharma Traders',
    contact_person: 'Vikram Sethi',
    gst_no: '07AAACN5555A1Z4',
    email: 'ops@northstar.example',
    mobile: '+919800000006',
    district: 'New Delhi',
    state: 'DL',
    payment_terms: 'Net 21',
  },
  {
    party_type: 'customer',
    party_name: 'Sunrise Nursing Home',
    contact_person: 'Dr. Kavita Rao',
    gst_no: '36AAACS6666A1Z3',
    email: 'admin@sunrisenh.example',
    mobile: '+919800000007',
    district: 'Hyderabad',
    state: 'TS',
    payment_terms: 'Net 30',
  },
  {
    party_type: 'supplier',
    party_name: 'Prime Med Devices',
    contact_person: 'Sanjay Kulkarni',
    gst_no: '27AAACP7777A1Z2',
    email: 'dispatch@primemed.example',
    mobile: '+919800000008',
    district: 'Nagpur',
    state: 'MH',
    payment_terms: 'Net 10',
  },
  {
    party_type: 'customer',
    party_name: 'GreenCross Clinic',
    contact_person: 'Front Office',
    gst_no: '32AAACG8888A1Z1',
    email: 'billing@greencross.example',
    mobile: '+919800000009',
    district: 'Kochi',
    state: 'KL',
    payment_terms: 'Net 15',
  },
  {
    party_type: 'both',
    party_name: 'Metro Medical Agency',
    contact_person: 'Farhan Khan',
    gst_no: '19AAACM9999A1Z9',
    email: 'accounts@metromedical.example',
    mobile: '+919800000010',
    district: 'Kolkata',
    state: 'WB',
    payment_terms: 'Net 30',
  },
]);

const SAMPLE_PRODUCTS = Object.freeze([
  {
    product_name: 'Surgical Glove Box',
    generic_name: 'Latex examination gloves',
    aliases: ['gloves', 'surgical gloves'],
    sku: 'SKU-GLV-001',
    product_group: 'Consumables',
    product_subgroup: 'Gloves',
    brand: 'MediSafe',
    manufacturer: 'MediSafe Healthtech',
    unit: 'box',
    base_price: 1200,
    minimum_sale_rate: 1000,
    mrp: 1450,
    gst_percent: 18,
    warranty_months: 0,
    description: 'Powder-free disposable surgical gloves, box of 100.',
    tags: ['consumable', 'ppe'],
  },
  {
    product_name: 'Digital Thermometer',
    generic_name: 'Clinical digital thermometer',
    aliases: ['thermometer'],
    sku: 'SKU-THM-002',
    product_group: 'Devices',
    product_subgroup: 'Diagnostics',
    brand: 'ThermoCheck',
    manufacturer: 'Apex Diagnostics',
    unit: 'pcs',
    base_price: 180,
    minimum_sale_rate: 150,
    mrp: 249,
    gst_percent: 12,
    warranty_months: 12,
    description: 'Fast-read digital thermometer for clinical use.',
    tags: ['device', 'diagnostic'],
  },
  {
    product_name: 'Blood Pressure Monitor',
    generic_name: 'Automatic BP monitor',
    aliases: ['bp monitor', 'sphygmomanometer'],
    sku: 'SKU-BPM-003',
    product_group: 'Devices',
    product_subgroup: 'Diagnostics',
    brand: 'CardioMate',
    manufacturer: 'CardioMate Instruments',
    unit: 'pcs',
    base_price: 1450,
    minimum_sale_rate: 1250,
    mrp: 1899,
    gst_percent: 12,
    warranty_months: 24,
    description: 'Upper-arm automatic blood pressure monitor.',
    tags: ['device', 'bp'],
  },
  {
    product_name: 'Pulse Oximeter',
    generic_name: 'Finger-tip SpO2 monitor',
    aliases: ['spo2 monitor', 'oximeter'],
    sku: 'SKU-OXI-004',
    product_group: 'Devices',
    product_subgroup: 'Diagnostics',
    brand: 'OxiPro',
    manufacturer: 'OxiPro Medical',
    unit: 'pcs',
    base_price: 650,
    minimum_sale_rate: 560,
    mrp: 899,
    gst_percent: 12,
    warranty_months: 12,
    description: 'Portable fingertip pulse oximeter.',
    tags: ['device', 'spo2'],
  },
  {
    product_name: 'Paracetamol 500mg Tablet',
    generic_name: 'Paracetamol',
    aliases: ['acetaminophen', 'fever tablet'],
    sku: 'SKU-PCT-005',
    product_group: 'Medicines',
    product_subgroup: 'Analgesics',
    brand: 'FeverNil',
    manufacturer: 'CureLabs Pharma',
    unit: 'box',
    base_price: 320,
    minimum_sale_rate: 280,
    mrp: 410,
    gst_percent: 12,
    warranty_months: 0,
    description: 'Paracetamol 500mg, 10 strips per box.',
    tags: ['medicine', 'tablet'],
  },
  {
    product_name: 'Amoxicillin 500mg Capsule',
    generic_name: 'Amoxicillin',
    aliases: ['antibiotic capsule'],
    sku: 'SKU-AMX-006',
    product_group: 'Medicines',
    product_subgroup: 'Antibiotics',
    brand: 'AmoxiCare',
    manufacturer: 'NovaCure Pharma',
    unit: 'box',
    base_price: 780,
    minimum_sale_rate: 700,
    mrp: 950,
    gst_percent: 12,
    warranty_months: 0,
    description: 'Amoxicillin 500mg capsules, 10 strips per box.',
    tags: ['medicine', 'antibiotic'],
  },
  {
    product_name: 'Normal Saline 500ml',
    generic_name: 'Sodium chloride infusion',
    aliases: ['ns 500ml', 'saline bottle'],
    sku: 'SKU-NSL-007',
    product_group: 'IV Fluids',
    product_subgroup: 'Saline',
    brand: 'HydraMed',
    manufacturer: 'HydraMed Lifesciences',
    unit: 'bottle',
    base_price: 42,
    minimum_sale_rate: 36,
    mrp: 58,
    gst_percent: 5,
    warranty_months: 0,
    description: 'Sterile normal saline infusion bottle, 500ml.',
    tags: ['iv', 'fluid'],
  },
  {
    product_name: 'Disposable Syringe 5ml',
    generic_name: 'Sterile disposable syringe',
    aliases: ['5ml syringe'],
    sku: 'SKU-SYR-008',
    product_group: 'Consumables',
    product_subgroup: 'Syringes',
    brand: 'InjectSafe',
    manufacturer: 'InjectSafe Devices',
    unit: 'box',
    base_price: 260,
    minimum_sale_rate: 220,
    mrp: 340,
    gst_percent: 12,
    warranty_months: 0,
    description: 'Sterile disposable syringes, 5ml, box of 100.',
    tags: ['consumable', 'syringe'],
  },
  {
    product_name: 'Cotton Roll 500g',
    generic_name: 'Absorbent cotton wool',
    aliases: ['cotton wool', 'cotton roll'],
    sku: 'SKU-COT-009',
    product_group: 'Consumables',
    product_subgroup: 'Dressing',
    brand: 'SoftCare',
    manufacturer: 'SoftCare Medical',
    unit: 'pcs',
    base_price: 145,
    minimum_sale_rate: 125,
    mrp: 190,
    gst_percent: 5,
    warranty_months: 0,
    description: 'Absorbent cotton roll, 500g.',
    tags: ['consumable', 'dressing'],
  },
  {
    product_name: 'First Aid Kit',
    generic_name: 'Emergency first aid kit',
    aliases: ['emergency kit'],
    sku: 'SKU-FAK-010',
    product_group: 'Kits',
    product_subgroup: 'Emergency',
    brand: 'RescueReady',
    manufacturer: 'RescueReady Healthcare',
    unit: 'kit',
    base_price: 950,
    minimum_sale_rate: 820,
    mrp: 1199,
    gst_percent: 12,
    warranty_months: 6,
    description: 'General purpose first aid kit for clinics and offices.',
    tags: ['kit', 'emergency'],
  },
]);

async function bootstrap() {
  const plain = process.env.SEED_PASSWORD || 'ChangeMe123!';
  await syncExampleUsersToMongo(plain);

  const { User, Party, Product, Vehicle, Driver } = getModels();
  const admin = await User.findOne({ email: 'admin@medica.example' }).lean();

  const catalog = { seeded: false, parties: 0, products: 0 };
  if (!admin) {
    logger.warn('[seedMongo] no admin user; skip sample catalog');
    return { ran: true, catalog: { skipped: 'no-admin' } };
  }

  const samplePartyNames = SAMPLE_PARTIES.map((party) => party.party_name);
  const existingParties = await Party.find({
    party_name: { $in: samplePartyNames },
  })
    .select('party_name')
    .lean();
  const existingPartyNames = new Set(
    existingParties.map((party) => party.party_name),
  );
  const missingParties = SAMPLE_PARTIES.filter(
    (party) => !existingPartyNames.has(party.party_name),
  );

  if (missingParties.length > 0) {
    const parties = await Party.insertMany(
      missingParties.map((party) => ({
        ...party,
        is_active: true,
        created_by: admin._id,
      })),
    );
    catalog.seeded = true;
    catalog.parties = parties.length;
  }

  const sampleSkus = SAMPLE_PRODUCTS.map((product) => product.sku);
  const existingProducts = await Product.find({ sku: { $in: sampleSkus } })
    .select('sku')
    .lean();
  const existingSkus = new Set(existingProducts.map((product) => product.sku));
  const missingProducts = SAMPLE_PRODUCTS.filter(
    (product) => !existingSkus.has(product.sku),
  );

  if (missingProducts.length > 0) {
    const products = await Product.insertMany(
      missingProducts.map((product) => ({
        ...product,
        is_active: true,
        created_by: admin._id,
      })),
    );
    catalog.seeded = true;
    catalog.products = products.length;
  }

  if (!(await Vehicle.estimatedDocumentCount())) {
    await Vehicle.create({
      vehicle_no: 'MH12AB1234',
      vehicle_type: 'truck',
      capacity: '3T',
      ownership_type: 'owned',
      status: 'available',
      is_active: true,
    });
  }

  if (!(await Driver.estimatedDocumentCount())) {
    await Driver.create({
      name: 'Ravi Patil',
      phone: '+919822000001',
      license_no: 'MH04201100001234',
      status: 'available',
      is_active: true,
    });
  }

  logger.info('[seedMongo] Mongo bootstrap complete', catalog);
  return { ran: true, catalog };
}

module.exports = { bootstrap };
