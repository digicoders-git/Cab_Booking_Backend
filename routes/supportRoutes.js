const express = require("express");
const router = express.Router();
const {
    createSupportRequest,
    getMySupportRequests,
    getAllSupportRequests,
    replyToSupportRequest,
    getSupportSummary,
    deleteSupportRequest
} = require("../controllers/supportController");
const { auth, adminOnly } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");

// 1. Create Support Ticket (All Panels)
router.post("/create", auth, createSupportRequest);

// 2. My Tickets History (All Panels)
router.get("/my-tickets", auth, getMySupportRequests);

// 2.b Support Summary Report (All Panels)
router.get("/report-summary", auth, getSupportSummary);

// 3. Admin View: All Tickets
router.get("/admin/all", auth, checkPermission("SUPPORT_READ"), getAllSupportRequests);

// 4. Admin View: Reply & Update Ticket
router.put("/admin/reply/:id", auth, checkPermission("SUPPORT_REPLY"), replyToSupportRequest);

// 5. Admin: Delete Ticket
router.delete("/admin/delete/:id", auth, checkPermission("SUPPORT_DELETE"), deleteSupportRequest);

module.exports = router;
