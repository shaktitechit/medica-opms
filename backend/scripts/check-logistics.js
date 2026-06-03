require('dotenv').config();
const { connect } = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');

connect().then(async () => {
  const { Order, OrderDispatch, TransportShipment } = getModels();
  
  console.log("=== LATEST ORDERS ===");
  const orders = await Order.find({}).sort({ updatedAt: -1 }).limit(5).lean();
  for (const o of orders) {
    const dispatches = await OrderDispatch.find({ order: o._id }).lean();
    const transports = await TransportShipment.find({ order: o._id }).lean();
    
    console.log({
      id: o._id,
      order_no: o.order_no,
      status: o.status,
      workflow_stage: o.workflow_stage,
      dispatch_status: o.dispatch_status,
      dispatches_count: dispatches.length,
      transports_count: transports.length,
      dispatches: dispatches.map(d => ({ id: d._id, dispatch_no: d.dispatch_no, status: d.dispatch_status })),
      transports: transports.map(t => ({ id: t._id, shipment_no: t.shipment_no, status: t.shipment_status }))
    });
  }
  
  process.exit(0);
}).catch(err => {
  console.error("Connection error:", err);
  process.exit(1);
});
