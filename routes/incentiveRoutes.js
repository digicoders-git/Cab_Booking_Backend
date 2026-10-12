const express = require('express');
const router = express.Router();
const { 
    createIncentive, 
    getAllIncentives, 
    deleteIncentive, 
    getDriverIncentives 
} = require('../controllers/incentiveController');
const { auth, adminOnly } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// --- Admin Routes ---
router.get('/admin', auth, checkPermission('DRIVER_INCENTIVE_READ'), getAllIncentives);
router.post('/admin', auth, checkPermission('DRIVER_INCENTIVE_CREATE'), createIncentive);
router.delete('/admin/:id', auth, checkPermission('DRIVER_INCENTIVE_DELETE'), deleteIncentive);

// --- Driver Routes ---
router.get('/driver', auth, getDriverIncentives);

module.exports = router;
