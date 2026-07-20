/**
 * @fileoverview Express app: CORS/auth middleware, mounts `/api/*` routers, 404 + error handlers.
 * @module app
 */
const express = require('express');
const cors = require('cors');
const corsOptions = require('./config/cors');
const { JSON_BODY_LIMIT } = require('./config/env');
const { authMiddleware } = require('./middlewares/auth.middleware');
const { errorMiddleware } = require('./middlewares/error.middleware');
const { notFound } = require('./middlewares/notFound.middleware');
const swaggerUi = require('swagger-ui-express');
const { spec: swaggerDocument } = require('./docs/swagger');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const partyRoutes = require('./modules/parties/party.routes');
const productRoutes = require('./modules/products/product.routes');
const productGroupRoutes = require('./modules/productGroups/productGroup.routes');
const productSubgroupRoutes = require('./modules/productSubgroups/productSubgroup.routes');
const productBrandRoutes = require('./modules/productBrands/productBrand.routes');
const productManufacturerRoutes = require('./modules/productManufacturers/productManufacturer.routes');
const partyProductRoutes = require('./modules/partyProducts/partyProduct.routes');
const orderRoutes = require('./modules/orders/order.routes');
const approvalRoutes = require('./modules/approvals/approval.routes');
const financeRoutes = require('./modules/finance/finance.routes');
const orderApprovalRoutes = require('./modules/orderApproval/orderApproval.routes');
const dispatchRoutes = require('./modules/dispatch/dispatch.routes');
const transportRoutes = require('./modules/transport/transport.routes');
const orderDeliveryRoutes = require('./modules/orderDelivery/orderDelivery.routes');
const orderReturnRoutes = require('./modules/orderReturn/orderReturn.routes');
const orderDueSheetRoutes = require('./modules/orderDueSheet/orderDueSheet.routes');
const finalOrderStatementRoutes = require('./modules/finalOrderStatement/finalOrderStatement.routes');
const flagRoutes = require('./modules/flags/flag.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const activityRoutes = require('./modules/activity/activity.routes');
const attachmentRoutes = require('./modules/attachments/attachment.routes');
const vehicleRoutes = require('./modules/fleet/vehicle.routes');
const driverRoutes = require('./modules/fleet/driver.routes');
const transportAgentRoutes = require('./modules/fleet/transportAgent.routes');
const filesRoutes = require('./modules/files/files.routes');
const partyOrderProductsRateRoutes = require('./modules/partyOrderProductsRate/partyOrderProductsRate.routes');
const messageRoutes = require('./modules/messages/message.routes');
const communicationRoutes = require('./modules/communication/communication.routes');
const reminderRoutes = require('./modules/reminders/reminder.routes');
const workPlannerRoutes = require('./modules/workPlanner/workPlanner.routes');
const pushRoutes = require('./modules/push/push.routes');

const app = express();
app.use(cors(corsOptions));
app.use(express.json({
  limit: JSON_BODY_LIMIT,
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(authMiddleware);

app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/', (_req, res) =>
  res.json({
    ok: true,
    service: 'medica-backend',
    message: 'Use paths under /api — the site root has no SPA.',
    health: '/health',
    api_docs: '/api-docs',
    examples: {
      login_post: '/api/auth/login',
      orders: '/api/orders',
      me: '/api/auth/me',
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/products', productRoutes);
app.use('/api/product-groups', productGroupRoutes);
app.use('/api/product-subgroups', productSubgroupRoutes);
app.use('/api/product-brands', productBrandRoutes);
app.use('/api/product-manufacturers', productManufacturerRoutes);
app.use('/api/party-products', partyProductRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/order-approvals', orderApprovalRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/order-deliveries', orderDeliveryRoutes);
app.use('/api/order-returns', orderReturnRoutes);
app.use('/api/order-due-sheets', orderDueSheetRoutes);
app.use('/api/final-order-statements', finalOrderStatementRoutes);
app.use('/api/flags', flagRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/transport-agents', transportAgentRoutes);
app.use('/api/party-order-products-rate', partyOrderProductsRateRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/work-plans', workPlannerRoutes);
app.use('/api', pushRoutes);
app.use('/api', filesRoutes);

app.use(notFound);
app.use(errorMiddleware);

module.exports = app;
