const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const agentLeadController = require('../controllers/agentLeadController');

// All routes require authentication

// Agent routes
router.post('/create', auth, agentLeadController.createLead);

// Driver routes
router.get('/marketplace', auth, agentLeadController.getMarketplaceLeads);
router.get('/driver/my-accepted-leads', auth, agentLeadController.getDriverAcceptedLeads);
router.post('/:leadId/initiate-payment', auth, agentLeadController.initiateAcceptPayment);
router.post('/execute/payment-return', agentLeadController.paymentReturn);
router.get('/execute/payment-return', agentLeadController.paymentReturn);
router.post('/:leadId/complete', auth, agentLeadController.completeLead);
router.get('/agent/my-leads', auth, agentLeadController.getMyLeads);

// Shared/Admin routes
router.post('/:leadId/cancel', auth, agentLeadController.cancelLead);
router.get('/admin/all', auth, agentLeadController.getAllLeadsAdmin);
router.post('/admin/:leadId/accept', auth, agentLeadController.adminAcceptLead);
router.post('/admin/:leadId/complete', auth, agentLeadController.adminCompleteLead);

// Receipt Route
router.get('/receipt/:leadId', auth, agentLeadController.downloadReceipt);
router.get('/driver-receipt/:leadId', auth, agentLeadController.downloadDriverReceipt);

module.exports = router;
