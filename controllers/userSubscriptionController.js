const SubscriptionPlan = require('../models/SubscriptionPlan');
const UserSubscription = require('../models/UserSubscription');
const User = require('../models/User');
const { RazorpayHandler } = require('../utils/RazorpayHandler');
const razorpayHandler = RazorpayHandler.getInstance();
const Admin = require('../models/Admin');

// Get all active plans for users
exports.getActivePlans = async (req, res) => {
    try {
        const plans = await SubscriptionPlan.find({ isActive: true })
            .populate('carCategory', 'name image baseFare perKmRate')
            .sort({ createdAt: -1 });
        res.json({ success: true, plans });
    } catch (error) {
        console.error("Error fetching plans:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// User buys a subscription
exports.buySubscription = async (req, res) => {
    try {
        const { planId, pickupTime, returnTime } = req.body;
        
        const plan = await SubscriptionPlan.findById(planId);
        if (!plan || !plan.isActive) {
            return res.status(400).json({ success: false, message: "Plan is invalid or inactive" });
        }

        const userRecord = await User.findById(req.user.id);
        if (!userRecord) return res.status(404).json({ success: false, message: "User not found" });

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + plan.validityDays);

        const subscription = new UserSubscription({
            user: req.user.id,
            plan: plan._id,
            pickup: plan.pickup,
            drop: plan.drop,
            routeDistanceKm: plan.distanceKm,
            pickupTime,
            returnTime,
            startDate,
            endDate,
            paymentStatus: 'Pending',
            status: 'Inactive' // Make active only after payment
        });

        await subscription.save();

        const orderIdString = `sub_${subscription._id.toString().slice(-6)}_${Date.now()}`;
        const frontendOrigin = req.headers.origin || 'http://localhost:5173';
        const protocol = req.get('host').includes('localhost') || req.get('host').includes('127.0.0.1') ? req.protocol : 'https';
        const returnUrl = `${protocol}://${req.get('host')}/api/users/subscription-payment-return?redirect=${encodeURIComponent(frontendOrigin + '/my-subscriptions')}`;

        const sessionResponse = await razorpayHandler.orderSession({
            order_id: orderIdString,
            amount: plan.price.toFixed(2),
            customer_id: req.user.id.toString(),
            customer_email: userRecord.email || "test@example.com",
            customer_phone: userRecord.phone || "9999999999",
            return_url: returnUrl
        });

        subscription.transactionId = orderIdString;
        await subscription.save();

        res.status(201).json({ 
            success: true, 
            message: "Redirecting to payment gateway...", 
            paymentUrl: sessionResponse.payment_links?.web || sessionResponse.payment_links?.mobile || sessionResponse.short_url || sessionResponse.payment_links?.short_url,
            subscription 
        });
    } catch (error) {
        console.error("Error booking subscription:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

exports.subscriptionPaymentReturn = async (req, res) => {
    try {
        const payload = req.method === 'POST' ? req.body : req.query;
        const {
            razorpay_payment_id,
            razorpay_payment_link_id,
            razorpay_payment_link_reference_id,
            razorpay_payment_link_status,
            razorpay_signature,
            redirect
        } = payload;

        const targetRedirect = redirect || `${req.protocol}://${req.get('host')}/my-subscriptions`;

        if (razorpay_payment_link_status !== 'paid') {
            if (razorpay_payment_link_reference_id) {
                await UserSubscription.findOneAndUpdate(
                    { transactionId: razorpay_payment_link_reference_id },
                    { paymentStatus: 'Failed', status: 'Inactive' }
                );
            }
            return res.redirect(`${targetRedirect}?payment_status=failed`);
        }

        const isValid = razorpayHandler.validateSignature(
            razorpay_payment_id,
            razorpay_payment_link_id,
            razorpay_payment_link_reference_id,
            razorpay_payment_link_status,
            razorpay_signature
        );

        if (!isValid) {
            if (razorpay_payment_link_reference_id) {
                await UserSubscription.findOneAndUpdate(
                    { transactionId: razorpay_payment_link_reference_id },
                    { paymentStatus: 'Failed', status: 'Inactive' }
                );
            }
            return res.redirect(`${targetRedirect}?payment_status=failed`);
        }

        const subscription = await UserSubscription.findOne({ transactionId: razorpay_payment_link_reference_id });
        if (subscription && subscription.paymentStatus !== 'Completed') {
            subscription.paymentStatus = 'Completed';
            subscription.status = 'Active';
            subscription.transactionId = razorpay_payment_id;
            await subscription.save();
            
            const plan = await SubscriptionPlan.findById(subscription.plan);
            if (plan) {
                const Transaction = require('../models/Transaction');

                // 1. Create Debit Transaction for User
                await Transaction.create({
                    user: subscription.user,
                    userModel: 'User',
                    amount: plan.price,
                    type: 'Debit',
                    category: 'Subscription',
                    status: 'Completed',
                    description: `Payment for Subscription Pass: ${plan.name} (${plan.validityDays} Days)`
                });

                // 2. Credit Admin Wallet & Create Admin Credit Transaction
                const admin = await Admin.findOne({ role: 'SuperAdmin' }) || await Admin.findOne();
                if (admin) {
                    admin.walletBalance = (admin.walletBalance || 0) + plan.price;
                    admin.totalEarnings = (admin.totalEarnings || 0) + plan.price;
                    await admin.save();

                    await Transaction.create({
                        user: admin._id,
                        userModel: 'Admin',
                        amount: plan.price,
                        type: 'Credit',
                        category: 'Subscription',
                        status: 'Completed',
                        description: `Payment received for Subscription Pass (${plan.name}) from User #${subscription.user.toString().slice(-6)}`
                    });
                }
            }
        }

        return res.redirect(`${targetRedirect}?payment_status=success`);
    } catch (error) {
        console.error("Subscription Payment Return Error:", error);
        const fallback = req.query.redirect || req.body?.redirect || '/my-subscriptions';
        return res.redirect(`${fallback}?payment_status=error`);
    }
};

// Get User's active completed subscriptions
exports.getMySubscriptions = async (req, res) => {
    try {
        // Only return subscriptions where payment is completed
        const subscriptions = await UserSubscription.find({ 
            user: req.user.id,
            paymentStatus: 'Completed'
        })
            .populate({
                path: 'plan',
                populate: { path: 'carCategory' }
            })
            .sort({ createdAt: -1 });
        res.json({ success: true, subscriptions });
    } catch (error) {
        console.error("Error fetching user subscriptions:", error);
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
