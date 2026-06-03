require('dotenv').config();
const { connect } = require('../src/config/db');
const { getModels } = require('../src/data/mongoRegistry');

connect().then(async () => {
  const { Order, OrderDispatch, OrderWorkflow, TransportShipment } = getModels();
  
  const order = await Order.findOne({ order_no: 'ORD-MPTTAVUU-S3DI5W' }).lean();
  console.log("=== ORDER DETAILS ===");
  console.log(order);
  
  console.log("\n=== DISPATCH DETAILS ===");
  const dispatches = await OrderDispatch.find({ order: order._id }).lean();
  console.log(dispatches);
  
  console.log("\n=== WORKFLOW HISTORY ===");
  const workflow = await OrderWorkflow.find({ order: order._id }).sort({ createdAt: 1 }).lean();
  console.log(workflow);
  
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
