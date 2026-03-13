const Transaction = require("../models/Transaction");
const Driver = require("../models/Driver");
const Agent = require("../models/Agent");
const Fleet = require("../models/Fleet");
const Admin = require("../models/Admin");

// 1. Get Wallet Balance and Transaction History
exports.getWalletDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role; // 'driver', 'agent', 'fleet', 'admin'

        let userModel;
        let userData;

        if (role === 'driver') {
            userModel = 'Driver';
            userData = await Driver.findById(userId);
        } else if (role === 'agent') {
            userModel = 'Agent';
            userData = await Agent.findById(userId);
        } else if (role === 'fleet') {
            userModel = 'Fleet';
            userData = await Fleet.findById(userId);
        } else if (role === 'admin') {
            userModel = 'Admin';
            userData = await Admin.findById(userId);
        }

        if (!userData) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const transactions = await Transaction.find({ user: userId, userModel: userModel })
            .sort({ createdAt: -1 })
            .limit(50);

        res.json({
            success: true,
            walletBalance: userData.walletBalance || 0,
            totalEarnings: userData.totalEarnings || 0,
            transactions
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 2. Request Withdrawal (Payout)
exports.requestWithdrawal = async (req, res) => {
    try {
        const { amount, description } = req.body;
        const userId = req.user.id;
        const role = req.user.role;

        let userModel;
        let userData;

        if (role === 'driver') {
            userModel = 'Driver';
            userData = await Driver.findById(userId);
        } else if (role === 'agent') {
            userModel = 'Agent';
            userData = await Agent.findById(userId);
        } else if (role === 'fleet') {
            userModel = 'Fleet';
            userData = await Fleet.findById(userId);
        }

        if (!userData || userData.walletBalance < amount) {
            return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
        }

        // Create a pending debit transaction
        const transaction = await Transaction.create({
            user: userId,
            userModel: userModel,
            amount: amount,
            type: 'Debit',
            category: 'Withdrawal',
            status: 'Pending',
            description: description || "Withdrawal request",
            bankDetails: userData.bankDetails
        });

        // Deduct from wallet immediately to prevent double-spending
        userData.walletBalance -= amount;
        await userData.save();

        res.json({
            success: true,
            message: "Withdrawal request submitted for Admin approval",
            transaction
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3. Admin: Approve Withdrawal
exports.approveWithdrawal = async (req, res) => {
    try {
        const { transactionId } = req.params;
        
        const transaction = await Transaction.findById(transactionId);
        if (!transaction || transaction.category !== 'Withdrawal') {
            return res.status(404).json({ success: false, message: "Withdrawal request not found" });
        }

        if (transaction.status !== 'Pending') {
            return res.status(400).json({ success: false, message: "Transaction already processed" });
        }

        transaction.status = 'Completed';
        await transaction.save();

        res.json({ success: true, message: "Withdrawal approved successfully" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 4. Admin: Reject Withdrawal (Refunds user)
exports.rejectWithdrawal = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { reason } = req.body;

        const transaction = await Transaction.findById(transactionId);
        if (!transaction || transaction.status !== 'Pending') {
            return res.status(400).json({ success: false, message: "Invalid transaction" });
        }

        transaction.status = 'Cancelled';
        transaction.description += ` (Rejected: ${reason})`;
        await transaction.save();

        // Refund the amount to the user's wallet
        let user;
        if (transaction.userModel === 'Driver') user = await Driver.findById(transaction.user);
        if (transaction.userModel === 'Agent') user = await Agent.findById(transaction.user);
        if (transaction.userModel === 'Fleet') user = await Fleet.findById(transaction.user);

        if (user) {
            user.walletBalance += transaction.amount;
            await user.save();
        }

        res.json({ success: true, message: "Withdrawal rejected and amount refunded to wallet" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
