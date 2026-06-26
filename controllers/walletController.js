const Transaction = require("../models/Transaction");
const Driver = require("../models/Driver");
const Agent = require("../models/Agent");
const Fleet = require("../models/Fleet");
const Admin = require("../models/Admin");
const User = require("../models/User");

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
        } else if (role === 'user') {
            userModel = 'User';
            userData = await User.findById(userId);
        }

        if (!userData) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const transactions = await Transaction.find({ user: userId, userModel: userModel })
            .sort({ createdAt: -1 });

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
        } else if (role === 'user') {
            userModel = 'User';
            userData = await User.findById(userId);
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
        if (transaction.userModel === 'User') user = await User.findById(transaction.user);

        if (user) {
            user.walletBalance += transaction.amount;
            await user.save();
        }

        res.json({ success: true, message: "Withdrawal rejected and amount refunded to wallet" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 5. Admin: Get All Transactions (Filtered to Admin by default for Wallet Center)
exports.getAllTransactions = async (req, res) => {
    try {
        // Default filter to only show Admin's own transactions for the Wallet Command Center
        // But allowing an optional query param if we ever need to see everything
        const filter = req.query.all === 'true' ? {} : { userModel: 'Admin' };

        const transactions = await Transaction.find(filter)
            .populate("user", "name phone image")
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({
            success: true,
            count: transactions.length,
            transactions
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 6. Admin: Get all Pending Withdrawal Requests
exports.getPendingPayouts = async (req, res) => {
    try {
        const pendingPayouts = await Transaction.find({ 
            category: 'Withdrawal', 
            status: 'Pending' 
        })
        .populate("user", "name phone email image") // Dynamic populate based on userModel
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: pendingPayouts.length,
            payouts: pendingPayouts
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 7. Export Transactions (CSV)
exports.exportTransactions = async (req, res) => {
    try {
        const { timeframe, startDate, endDate, format } = req.query;
        let dateFilter = {};

        const now = new Date();
        if (timeframe === 'daily') {
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);
            dateFilter = { $gte: startOfDay, $lte: endOfDay };
        } else if (timeframe === 'weekly') {
            const lastWeek = new Date(now);
            lastWeek.setDate(now.getDate() - 7);
            dateFilter = { $gte: lastWeek, $lte: new Date() };
        } else if (timeframe === 'monthly') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            dateFilter = { $gte: startOfMonth, $lte: new Date() };
        } else if (timeframe === 'yearly') {
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            dateFilter = { $gte: startOfYear, $lte: new Date() };
        } else if (timeframe === 'custom' && startDate && endDate) {
            dateFilter = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const filter = {};
        if (Object.keys(dateFilter).length > 0) {
            filter.createdAt = dateFilter;
        }

        const transactions = await Transaction.find(filter)
            .populate("user", "name phone email")
            .sort({ createdAt: -1 });

        // Map for export
        const exportData = transactions.map(tx => {
            const userName = tx.user ? (tx.user.name || 'Unknown') : 'System/Unknown';
            return {
                Date: new Date(tx.createdAt).toLocaleString('en-IN'),
                Name: userName,
                Role: tx.userModel,
                Type: tx.type,
                Category: tx.category,
                Amount: tx.amount,
                Status: tx.status,
                Description: tx.description
            };
        });

        if (format === 'csv' || !format) {
            const { Parser } = require('json2csv');
            const json2csvParser = new Parser();
            
            // Handle empty data case
            if (exportData.length === 0) {
                exportData.push({ Date: '', Name: '', Role: '', Type: '', Category: '', Amount: '', Status: '', Description: 'No transactions found' });
            }
            
            const csv = json2csvParser.parse(exportData);

            res.header('Content-Type', 'text/csv');
            res.attachment('transactions.csv');
            return res.send(csv);
        } else {
            return res.status(400).json({ success: false, message: "Unsupported format. Use format=csv" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 8. Admin: Manually Add Balance to a User/Agent/Driver/Fleet
exports.addManualBalance = async (req, res) => {
    try {
        const { targetUserId, targetUserModel, amount, description } = req.body;

        if (!targetUserId || !targetUserModel || !amount) {
            return res.status(400).json({ success: false, message: "Missing required fields: targetUserId, targetUserModel, amount" });
        }

        const adjustmentAmount = Number(amount);
        if (adjustmentAmount === 0) {
            return res.status(400).json({ success: false, message: "Amount cannot be zero" });
        }

        // Query can be Email, Phone, or MongoDB Object ID
        let query;
        if (targetUserId.includes('@')) {
            query = { email: targetUserId };
        } else if (targetUserId.length === 24 && /^[0-9a-fA-F]{24}$/.test(targetUserId)) {
            query = { _id: targetUserId };
        } else {
            // Use regex to match the end of the phone number, 
            // so 9876543210 matches +919876543210
            query = { phone: { $regex: new RegExp(targetUserId + '$') } };
        }

        let user;
        if (targetUserModel === 'Driver') user = await Driver.findOne(query);
        else if (targetUserModel === 'Agent') user = await Agent.findOne(query);
        else if (targetUserModel === 'Fleet') user = await Fleet.findOne(query);
        else if (targetUserModel === 'User') user = await User.findOne(query);
        
        if (!user) {
            return res.status(404).json({ success: false, message: `${targetUserModel} not found` });
        }

        // Add balance (can be negative for deduction)
        user.walletBalance = (user.walletBalance || 0) + adjustmentAmount;
        await user.save();

        // Create transaction log
        const transaction = await Transaction.create({
            user: user._id, // Must be the actual ObjectId from the found user, not the raw input
            userModel: targetUserModel,
            amount: Math.abs(adjustmentAmount),
            type: adjustmentAmount > 0 ? 'Credit' : 'Debit',
            category: 'Admin Adjustment', // Must match the enum in Transaction model
            status: 'Completed',
            description: description || (adjustmentAmount > 0 ? `Manual credit by Admin` : `Manual debit by Admin`)
        });

        res.json({ 
            success: true, 
            message: `Successfully ${adjustmentAmount > 0 ? 'added' : 'deducted'} ₹${Math.abs(adjustmentAmount)} ${adjustmentAmount > 0 ? 'to' : 'from'} ${user.name || targetUserModel}'s wallet`,
            newBalance: user.walletBalance,
            transaction 
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
