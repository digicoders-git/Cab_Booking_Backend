const express = require("express");
const router = express.Router();
const { 
    getWalletDetails, 
    requestWithdrawal, 
    approveWithdrawal, 
    rejectWithdrawal 
} = require("../controllers/walletController");
const { auth, adminOnly } = require("../middleware/auth");

// 1. All Users: View Wallet
router.get("/my-wallet", auth, getWalletDetails);

// 2. Driver/Agent/Fleet: Request Money Withdrawal
router.post("/withdraw", auth, requestWithdrawal);

// 3. Admin: Manage Withdrawal Requests
router.put("/admin/payouts/:transactionId/approve", auth, adminOnly, approveWithdrawal);
router.put("/admin/payouts/:transactionId/reject", auth, adminOnly, rejectWithdrawal);

module.exports = router;
