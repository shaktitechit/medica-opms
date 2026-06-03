const { getModels } = require('../src/data/mongoRegistry');

async function migrate() {
  const { Order, OrderDispatch, TransportShipment } = getModels();
  const orders = await Order.find({}).lean();
  console.log(`Found ${orders.length} orders to migrate.`);

  let migratedCount = 0;
  for (const order of orders) {
    let status = 'draft';
    
    const action = order.current_action;
    const mapping = {
      drafted: 'draft',
      submitted: 'submitted',
      approved: 'sales_approved',
      review_requested: 'finance_review',
      fully_approved: 'finance_approved',
      partially_finance_approved: 'partially_finance_approved',
      fully_finance_approved: 'fully_finance_approved',
      rejected: 'finance_rejected',
      sent_to_dispatch: 'dispatch_pending',
      partial_dispatch: 'partial_dispatch_created',
      full_dispatch: 'full_dispatch_created',
      transporter_assigned: 'transport_assigned',
      vehicle_assigned: 'transport_assigned',
      picked_up: 'in_transit',
      in_transit: 'in_transit',
      out_for_delivery: 'in_transit',
      delivered: 'delivered',
      cancelled: 'cancelled',
      hold: 'on_hold',
      partially_transported: 'partially_transported',
      fully_transported: 'fully_transported',
    };

    if (action === 'transport_created') {
      const shipments = await TransportShipment.find({
        order: order._id,
        deletedAt: null,
        shipment_status: { $nin: ['delivery_failed', 'returned'] },
      }).lean();

      if (shipments.length === 0) {
        if (order.dispatch_status === 'completed') {
          status = 'full_dispatch_created';
        } else if (order.dispatch_status === 'partial') {
          status = 'partial_dispatch_created';
        } else {
          status = 'dispatch_pending';
        }
      } else {
        const dispatches = await OrderDispatch.find({
          order: order._id,
          deletedAt: null,
          dispatch_status: { $ne: 'cancelled' },
        }).lean();

        const shippedDispatchIds = new Set(shipments.map(s => String(s.dispatch)));
        const allDispatchesShipped = dispatches.length > 0 &&
          dispatches.every(d => shippedDispatchIds.has(String(d._id)));

        status = allDispatchesShipped ? 'fully_transported' : 'partially_transported';
      }
    } else {
      status = mapping[action] || order.lifecycle_status || 'draft';
    }

    await Order.updateOne({ _id: order._id }, { $set: { status } });
    console.log(`Updated Order ${order.order_no}: action=${action} -> status=${status}`);
    migratedCount++;
  }

  console.log(`Successfully migrated status field for ${migratedCount} orders.`);
}

require('dotenv').config();
require('../src/config/db').connect().then(async () => {
  await migrate();
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
