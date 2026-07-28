const express = require('express');
const router = express.Router();
const driverLeadController = require('../controllers/driverLeadController');

// Define routes
router.post('/add', driverLeadController.createLead);
router.get('/', driverLeadController.getLeads);
router.delete('/:id', driverLeadController.deleteLead);

module.exports = router;
