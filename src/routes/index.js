const express = require('express');
const authRoutes = require('./auth.routes');
const clientRoutes = require('./client.routes');
const userRoutes = require('./user.routes');
const subscriptionRoutes = require('./subscription.routes');
const invoiceRoutes = require('./invoice.routes');
const safe2payRoutes = require('./safe2pay.routes');
const whatsappRoutes = require('./whatsapp.routes');
const reportRoutes = require('./report.routes');
const cnpjRoutes = require('./cnpj.routes');
const publicRoutes = require('./public.routes');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

// Rotas públicas
router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/webhooks/safe2pay', safe2payRoutes.webhooks);

// Rotas protegidas
router.use('/clients', authenticate, clientRoutes);
router.use('/users', authenticate, userRoutes);
router.use('/subscriptions', authenticate, subscriptionRoutes);
router.use('/invoices', authenticate, invoiceRoutes);
router.use('/safe2pay', authenticate, safe2payRoutes.protected);
router.use('/whatsapp', authenticate, whatsappRoutes);
router.use('/reports', authenticate, reportRoutes);
router.use('/cnpj', authenticate, cnpjRoutes);

module.exports = router;