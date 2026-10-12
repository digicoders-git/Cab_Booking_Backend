const express = require('express');
const router = express.Router();
const driverLeadController = require('../controllers/driverLeadController');
const { auth } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// Define routes
router.post('/add', driverLeadController.createLead); // Public/Driver register lead
router.get('/', auth, checkPermission('DRIVER_LEADS_READ'), driverLeadController.getLeads);
router.delete('/:id', auth, checkPermission('DRIVER_LEADS_DELETE'), driverLeadController.deleteLead);

module.exports = router;
