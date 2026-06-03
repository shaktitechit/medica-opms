require('dotenv').config();
require('./src/config/db').connect().then(async () => {
  const { Order, OrderFlag } = require('./src/data/mongoRegistry').getModels();
  const all = await Order.find({}).lean();
  const order = all.find(o => String(o._id).startsWith('6a10374'));
  if (!order) {
    console.log('Not found by prefix. All recent orders:');
    const recent = await Order.find({}).sort({ updatedAt: -1 }).limit(10).lean();
    recent.forEach(o => console.log(`  ${o._id} | ${o.order_no} | status=${o.status}`));
    process.exit(0);
  }
  console.log('ORDER:', {
    _id: order._id, order_no: order.order_no, status: order.status,
    assigned_sales_user: !!order.assigned_sales_user,
    assigned_admin_user: !!order.assigned_admin_user,
    assigned_finance_user: !!order.assigned_finance_user,
    assigned_dispatch_user: !!order.assigned_dispatch_user,
  });
  const flags = await OrderFlag.find({ order: order._id, status: 'open', blocks_order: true }).lean();
  console.log('BLOCKING FLAGS:', flags.length, flags.map(f => f.flag_type));
  process.exit(0);
}).catch(err => { console.error(err.message); process.exit(1); });
