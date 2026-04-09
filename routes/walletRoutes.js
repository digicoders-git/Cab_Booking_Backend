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
const { checkPermission } = require("../middleware/rbac");

// 1. All Users: View Wallet
router.get("/my-wallet", auth, getWalletDetails);
router.get("/fleet", auth, getWalletDetails); // Alias for Fleet Panel convenience

// 2. Driver/Agent/Fleet: Request Money Withdrawal
router.post("/withdraw", auth, requestWithdrawal);
router.post("/fleet/withdraw", auth, requestWithdrawal); // Alias for Fleet Panel convenience

// 3. Admin: Manage Withdrawal Requests
router.put("/admin/payouts/:transactionId/approve", auth, checkPermission("PAYOUT_APPROVE"), approveWithdrawal);
router.put("/admin/payouts/:transactionId/reject", auth, checkPermission("PAYOUT_REJECT"), rejectWithdrawal);

// 4. Admin: View Transaction History
router.get("/admin/transactions/all", auth, checkPermission("TRANSACTION_READ"), getAllTransactions);
router.get("/admin/payouts/pending", auth, checkPermission("PAYOUT_READ"), getPendingPayouts);

module.exports = router;
