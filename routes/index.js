const express = require('express');
const authRoutes = require('./auth');
const billRoutes = require('./bills');
const uploadRoutes = require('./upload');
const templateRoutes = require('./templates');
const { router: premiumRoutes, webhookRouter } = require('./premium');
const analyticsRoutes = require('./analytics');

const router = express.Router();

// Mount all routes under their respective paths
router.use('/auth', authRoutes);
router.use('/bills', billRoutes);
router.use('/upload', uploadRoutes);
router.use('/templates', templateRoutes);
router.use('/premium', premiumRoutes);
router.use('/analytics', analyticsRoutes);

// Export both the main router and the webhook router (for Stripe)
module.exports = { router, webhookRouter }; 