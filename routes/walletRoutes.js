const express = require("express");
const router = express.Router();
const { 
    getWalletDetails, 
    requestWithdrawal, 
    approveWithdrawal, 
    rejectWithdrawal,
    getAllTransactions,
    getPendingPayouts
} = require("../controllers/walletController");
const { auth, adminOnly } = require("../middleware/auth");

// 1. All Users: View Wallet
router.get("/my-wallet", auth, getWalletDetails);
router.get("/fleet", auth, getWalletDetails); // Alias for Fleet Panel convenience

// 2. Driver/Agent/Fleet: Request Money Withdrawal
router.post("/withdraw", auth, requestWithdrawal);
router.post("/fleet/withdraw", auth, requestWithdrawal); // Alias for Fleet Panel convenience

// 3. Admin: Manage Withdrawal Requests
router.put("/admin/payouts/:transactionId/approve", auth, adminOnly, approveWithdrawal);
router.put("/admin/payouts/:transactionId/reject", auth, adminOnly, rejectWithdrawal);

// 4. Admin: View Transaction History
router.get("/admin/transactions/all", auth, adminOnly, getAllTransactions);
router.get("/admin/payouts/pending", auth, adminOnly, getPendingPayouts);

module.exports = router;
