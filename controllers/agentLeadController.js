const AgentLead = require("../models/AgentLead");
const Agent = require("../models/Agent");
const Driver = require("../models/Driver");
const Admin = require("../models/Admin");
const Vendor = require("../models/Vendor");
const Transaction = require("../models/Transaction");
const { sendPushNotification } = require("../utils/fcmNotification");
const { PaymentHandler, validateHMAC_SHA256 } = require("../utils/PaymentHandler");
const paymentHandler = PaymentHandler.getInstance();

// 1. Agent Creates a Lead
exports.createLead = async (req, res) => {
    try {
        const agentId = req.user.id;
        const {
            customerName, customerPhone,
            carCategoryId,
            pickupAddress, pickupLat, pickupLng,
            dropAddress, dropLat, dropLng,
            pickupDateTime,
            totalPrice, agentCommission
        } = req.body;

        if (!carCategoryId) {
            return res.status(400).json({ success: false, message: "Car Category is required" });
        }

        if (totalPrice <= agentCommission) {
            return res.status(400).json({ success: false, message: "Total price must be greater than commission" });
        }

        const driverEarning = totalPrice - agentCommission;

        const newLead = await AgentLead.create({
            createdByAgent: agentId,
            customerName,
            customerPhone,
            carCategory: carCategoryId,
            pickup: { address: pickupAddress, latitude: pickupLat, longitude: pickupLng },
            drop: { address: dropAddress, latitude: dropLat, longitude: dropLng },
            pickupDateTime,
            totalPrice,
            agentCommission,
            driverEarning,
            status: 'Marketplace',
            paymentStatus: 'Pending'
        });

        // 🔔 NOTIFY DRIVERS: (Optional) Send push to nearby drivers about new lead
        res.status(201).json({
            success: true,
            message: "Lead created and added to Marketplace successfully!",
            lead: newLead
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 2. Drivers Fetch Marketplace Leads (Filtered by Driver's Car Category)
exports.getMarketplaceLeads = async (req, res) => {
    try {
        const driverId = req.user.id;
        const driver = await Driver.findById(driverId);
        
        if (!driver) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }
        
        const driverCarTypeId = driver.carDetails?.carType;
        
        if (!driverCarTypeId) {
            return res.status(400).json({ success: false, message: "Driver has no assigned car category. Cannot fetch leads." });
        }

        const leads = await AgentLead.find({ 
            status: 'Marketplace',
            carCategory: driverCarTypeId
        })
            .select("-customerName -customerPhone") // Hide customer details
            .populate('createdByAgent', 'name companyName') // Show who created it
            .populate('carCategory', 'name capacity') // Show requested vehicle type
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            leads
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 2b. Drivers Fetch their Accepted Leads
exports.getDriverAcceptedLeads = async (req, res) => {
    try {
        const driverId = req.user.id;
        const leads = await AgentLead.find({ 
            assignedDriver: driverId,
            status: { $in: ['Accepted', 'Ongoing', 'Completed'] } 
        })
        .populate('createdByAgent', 'name companyName phone')
        .sort({ updatedAt: -1 });

        res.json({
            success: true,
            leads
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 3. Initiate Online Payment to Accept Lead (HDFC)
exports.initiateAcceptPayment = async (req, res) => {
    try {
        const driverId = req.user.id;
        const { leadId } = req.params;

        const lead = await AgentLead.findById(leadId);
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        if (lead.status !== 'Marketplace') {
            return res.status(400).json({ success: false, message: "This lead is already taken or unavailable" });
        }

        const driver = await Driver.findById(driverId);
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

        // Amount to pay to unlock the lead
        const amountToCollect = lead.agentCommission;
        if (amountToCollect <= 0) {
            return res.status(400).json({ success: false, message: "Invalid commission amount" });
        }

        // Generate HDFC Order ID
        const orderIdString = `AGL_${leadId.slice(-6)}_${Date.now()}`;

        // Prepare return URL
        const frontendOrigin = req.headers.origin || process.env.FRONTEND_DRIVER_URL || 'http://localhost:5174';
        const protocol = req.get('host').includes('localhost') || req.get('host').includes('127.0.0.1') ? req.protocol : 'https';
        const returnUrl = `${protocol}://${req.get('host')}/api/agent-leads/execute/payment-return?redirect=${encodeURIComponent(frontendOrigin + '/driver/my-accepted-leads')}&driverId=${driverId}`;

        // Call HDFC API
        const sessionResponse = await paymentHandler.orderSession({
            order_id: orderIdString,
            amount: amountToCollect.toFixed(2),
            customer_id: driverId.toString(),
            customer_email: driver.email || "driver@example.com",
            customer_phone: driver.phone || "9999999999",
            return_url: returnUrl
        });

        // Save Order ID for verification later
        lead.hdfcOrderId = orderIdString;
        lead.pendingDriverId = driverId;
        await lead.save();

        res.json({
            success: true,
            orderId: orderIdString,
            amount: amountToCollect,
            paymentLinks: sessionResponse.payment_links || sessionResponse
        });

    } catch (error) {
        console.error("HDFC Order Error:", error.message);
        res.status(500).json({ success: false, message: "Payment initiation failed", error: error.message });
    }
};

// 3b. Verify HDFC Payment and Assign Lead
exports.verifyAcceptLeadPayment = async (req, res) => {
    try {
        const leadId = req.leadId || req.body.leadId || req.params.leadId;
        const hdfcTransactionId = req.hdfcTransactionId || req.body.transaction_id || req.body.order_id;
        const driverId = req.user.id;

        const lead = await AgentLead.findById(leadId);
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        if (lead.status !== 'Marketplace') {
            return res.status(400).json({ success: false, message: "This lead was already taken by someone else while payment was processing. Amount will be refunded." });
        }

        // Signature Verification using HDFC Utility
        const isValid = validateHMAC_SHA256(req.body, process.env.HDFC_RESPONSE_KEY);
        const isUAT = process.env.HDFC_BASE_URL && process.env.HDFC_BASE_URL.includes('uat');

        console.log("verifyAcceptLeadPayment: isValid=", isValid, "isUAT=", isUAT);

        if (!isValid) {
            if (isUAT) {
                console.warn("⚠️ [UAT Mode] Invalid Signature detected, but proceeding for simulator testing!");
            } else {
                console.error("verifyAcceptLeadPayment: Invalid signature! Returning 400.");
                return res.status(400).json({ success: false, message: "Invalid payment signature" });
            }
        }

        console.log("verifyAcceptLeadPayment: Signature valid/bypassed. Finding Admin.");

        const admin = await Admin.findOne({ role: 'SuperAdmin' });

        // Payment Success! Now Assign the Lead
        lead.hdfcTransactionId = hdfcTransactionId || req.body.transaction_id || req.body.order_id;
        lead.status = 'Accepted';
        lead.paymentStatus = 'Held_In_Escrow';
        lead.assignedDriver = driverId;
        lead.acceptedAt = new Date();
        await lead.save();

        // Put money in Admin Wallet as Escrow directly
        // Note: We don't deduct from driver wallet since they paid online!
        if (admin) {
            admin.walletBalance += lead.agentCommission;
            await admin.save();

            await Transaction.create({
                user: admin._id, userModel: 'Admin', amount: lead.agentCommission, type: 'Credit',
                category: 'Bulk Advance', status: 'Completed', relatedBooking: lead._id,
                description: `Online Escrow Hold: Agent Lead #${lead._id.toString().slice(-6)} unlocked by Driver`
            });
        }

        // Transaction log for driver just for records (Payment via HDFC, not wallet deduction)
        await Transaction.create({
            user: driverId, userModel: 'Driver', amount: lead.agentCommission, type: 'Debit',
            category: 'Bulk Advance', status: 'Completed', relatedBooking: lead._id,
            description: `Paid commission ONLINE to unlock Agent Lead #${lead._id.toString().slice(-6)}`
        });

        res.json({
            success: true,
            message: "Payment verified and Lead Unlocked Successfully!",
            lead
        });

    } catch (error) {
        console.error("Verification Error:", error.message);
        res.status(500).json({ success: false, message: "Verification failed", error: error.message });
    }
};

// 3c. Payment Return Webhook/Redirect from HDFC
exports.paymentReturn = async (req, res) => {
    try {
        const payload = req.method === 'POST' ? req.body : req.query;
        const fallbackUrl = process.env.FRONTEND_DRIVER_URL || 'http://localhost:5174';

        if (!payload || !payload.status) {
            return res.redirect((req.query.redirect || `${fallbackUrl}/driver/marketplace`) + '?error=invalid_payload');
        }

        const isValid = validateHMAC_SHA256(payload, process.env.HDFC_RESPONSE_KEY);
        const isUAT = process.env.HDFC_BASE_URL && process.env.HDFC_BASE_URL.includes('uat');

        console.log("paymentReturn: isValid=", isValid, "isUAT=", isUAT, "payload.status=", payload.status, "payload.status_id=", payload.status_id);

        if (!isValid && !isUAT) {
            console.error("paymentReturn: Invalid signature! Redirecting to error.");
            return res.redirect((req.query.redirect || `${fallbackUrl}/driver/marketplace`) + '?error=invalid_signature');
        }

        const orderId = payload.order_id;
        const status = payload.status ? payload.status.toUpperCase() : '';
        const statusId = payload.status_id ? String(payload.status_id) : '';

        if (status === 'CHARGED' || status === 'SUCCESS' || status === 'AUTHORIZING' || statusId === '21' || statusId === '28') {
            const lead = await AgentLead.findOne({ hdfcOrderId: orderId });

            if (lead) {
                // If it's already assigned, maybe another concurrent webhook got it
                if (lead.status !== 'Marketplace' && lead.assignedDriver) {
                    return res.redirect(`${req.query.redirect || fallbackUrl + '/driver/my-accepted-leads'}?success=true`);
                }

                // We need req.user for verification function
                // The order session doesn't easily store the driver ID unless we pass it.
                req.leadId = lead._id.toString();
                req.hdfcTransactionId = payload.transaction_id || orderId;
                
                const driverId = req.query.driverId || payload.customer_id || lead.pendingDriverId;
                if (!driverId) {
                    console.error("Missing driverId in HDFC return!");
                    return res.redirect((req.query.redirect || `${fallbackUrl}/driver/marketplace`) + '?error=missing_driver_info');
                }
                req.user = { id: driverId };
                // Also copy payload into req.body so verifyAcceptLeadPayment can validate the signature
                req.body = payload;

                const targetUrl = req.query.redirect || `${fallbackUrl}/driver/my-accepted-leads`;

                const originalJson = res.json;
                res.json = function (data) {
                    if (data.success) {
                        return res.redirect(`${targetUrl}?success=true`);
                    } else {
                        return res.redirect(`${targetUrl}?error=${encodeURIComponent(data.message)}`);
                    }
                };

                return exports.verifyAcceptLeadPayment(req, res);
            }
        }
        return res.redirect((req.query.redirect || `${fallbackUrl}/driver/marketplace`) + '?error=payment_failed');
    } catch (e) {
        console.error("Payment Return Error:", e);
        return res.redirect((req.query.redirect || `${fallbackUrl}/driver/marketplace`) + '?error=server_error');
    }
};

// 4. Driver Completes Lead (Escrow Settlement)
exports.completeLead = async (req, res) => {
    try {
        const { leadId } = req.params;
        const driverId = req.user.id;

        const lead = await AgentLead.findById(leadId).populate('createdByAgent');
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        if (lead.assignedDriver.toString() !== driverId.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        if (lead.status === 'Completed') {
            return res.status(400).json({ success: false, message: "Lead already completed" });
        }

        const admin = await Admin.findOne({ role: 'SuperAdmin' });
        const agent = lead.createdByAgent;

        if (lead.paymentStatus === 'Held_In_Escrow') {
            // Calculate Settlement
            const adminProfitPct = admin.agentLeadAdminProfitPct ?? 10;
            const adminProfit = Math.round(lead.agentCommission * (adminProfitPct / 100));
            const agentPayout = lead.agentCommission - adminProfit;

            // Admin already has the full amount in wallet. 
            // Deduct agent payout from admin, keep adminProfit.
            admin.walletBalance -= agentPayout;
            admin.totalEarnings = (admin.totalEarnings || 0) + adminProfit;
            await admin.save();

            // Pay Agent
            agent.walletBalance = (agent.walletBalance || 0) + agentPayout;
            agent.totalEarnings = (agent.totalEarnings || 0) + agentPayout;
            await agent.save();

            await Transaction.create({
                user: agent._id, userModel: 'Agent', amount: agentPayout, type: 'Credit',
                category: 'Commission', status: 'Completed', relatedBooking: leadId,
                description: `Earned commission for completed Lead #${leadId.toString().slice(-6)}`
            });

            await Transaction.create({
                user: admin._id, userModel: 'Admin', amount: lead.agentCommission, type: 'Debit',
                category: 'Bulk Advance', status: 'Completed', relatedBooking: leadId,
                description: `Released Escrow Hold for completed Lead #${leadId.toString().slice(-6)}`
            });

            if (adminProfit > 0) {
                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: adminProfit, type: 'Credit',
                    category: 'Commission', status: 'Completed', relatedBooking: leadId,
                    description: `Platform profit (10%) for completed Lead #${leadId.toString().slice(-6)}`
                });
            }

            // Master Franchise Logic: If agent has a vendor, give vendor a cut from Admin Profit
            if (agent.createdByVendor) {
                const vendor = await Vendor.findById(agent.createdByVendor);
                if (vendor) {
                    const vendorCommPct = vendor.commissionPercentage !== undefined ? vendor.commissionPercentage : 25;
                    const vendorCut = Math.round(adminProfit * (vendorCommPct / 100));

                    if (vendorCut > 0) {
                        admin.walletBalance -= vendorCut;
                        admin.totalEarnings -= vendorCut; // Reduce admin's actual net
                        await admin.save();

                        vendor.walletBalance = (vendor.walletBalance || 0) + vendorCut;
                        vendor.totalEarnings = (vendor.totalEarnings || 0) + vendorCut;
                        await vendor.save();

                        await Transaction.create({
                            user: admin._id, userModel: 'Admin', amount: vendorCut, type: 'Debit',
                            category: 'Commission', status: 'Completed', relatedBooking: leadId,
                            description: `Master Franchise Cut for Lead #${leadId.toString().slice(-6)}`
                        });

                        await Transaction.create({
                            user: vendor._id, userModel: 'Vendor', amount: vendorCut, type: 'Credit',
                            category: 'Commission', status: 'Completed', relatedBooking: leadId,
                            description: `Master Franchise Commission (Lead #${leadId.toString().slice(-6)})`
                        });
                    }
                }
            }
            lead.paymentStatus = 'Settled';
        }

        lead.status = 'Completed';
        await lead.save();

        res.json({
            success: true,
            message: "Lead completed and commission settled successfully!"
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 5. Cancel Lead (Refund Escrow)
exports.cancelLead = async (req, res) => {
    try {
        const { leadId } = req.params;
        const userId = req.user.id;
        const userModel = req.user.model || 'Admin'; // Admin or Driver can cancel

        const lead = await AgentLead.findById(leadId);
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        if (lead.status === 'Completed' || lead.status === 'Cancelled') {
            return res.status(400).json({ success: false, message: "Lead cannot be cancelled at this stage" });
        }

        // If driver had paid, refund driver from Admin escrow
        if (lead.paymentStatus === 'Held_In_Escrow' && lead.assignedDriver) {
            const driver = await Driver.findById(lead.assignedDriver);
            const admin = await Admin.findOne({ role: 'SuperAdmin' });

            if (driver && admin) {
                admin.walletBalance -= lead.agentCommission;
                await admin.save();

                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: lead.agentCommission, type: 'Debit',
                    category: 'Refund', status: 'Completed', relatedBooking: leadId,
                    description: `Escrow Refunded for Cancelled Lead #${leadId.toString().slice(-6)}`
                });

                driver.walletBalance += lead.agentCommission;
                await driver.save();

                await Transaction.create({
                    user: driver._id, userModel: 'Driver', amount: lead.agentCommission, type: 'Credit',
                    category: 'Refund', status: 'Completed', relatedBooking: leadId,
                    description: `Refunded commission for Cancelled Lead #${leadId.toString().slice(-6)}`
                });
            }
            lead.paymentStatus = 'Refunded';
        }

        lead.status = 'Cancelled';
        await lead.save();

        res.json({
            success: true,
            message: "Lead cancelled successfully"
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 6. Admin Fetch All Leads
exports.getAllLeadsAdmin = async (req, res) => {
    try {
        const leads = await AgentLead.find()
            .populate('createdByAgent', 'name phone companyName')
            .populate('assignedDriver', 'name phone carDetails')
            .populate('carCategory', 'name')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            leads
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 7. Agent Fetch Their Own Leads
exports.getMyLeads = async (req, res) => {
    try {
        const leads = await AgentLead.find({ createdByAgent: req.user.id })
            .populate('assignedDriver', 'name phone carDetails image')
            .populate('carCategory', 'name')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            leads
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 8. Download Receipt for Agent Lead
exports.downloadReceipt = async (req, res) => {
    try {
        const { leadId } = req.params;
        const lead = await AgentLead.findById(leadId)
            .populate('createdByAgent')
            .populate('carCategory')
            .populate('assignedDriver');
            
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        const fileName = `KwikCabs_Lead_${lead._id.toString().slice(-6).toUpperCase()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const pdfGenerator = require('../utils/pdfGenerator');
        await pdfGenerator.generateAgentLeadReceipt(lead, res);
    } catch (error) {
        console.error("Receipt generation error:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating receipt" });
        }
    }
};

// 9. Download Driver Commission Receipt for Agent Lead
exports.downloadDriverReceipt = async (req, res) => {
    try {
        const { leadId } = req.params;
        const lead = await AgentLead.findById(leadId)
            .populate('createdByAgent')
            .populate('carCategory')
            .populate('assignedDriver');
            
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        // Driver receipt only makes sense if the driver exists
        if (!lead.assignedDriver) {
            return res.status(400).json({ success: false, message: "Driver not assigned to this lead yet." });
        }

        const fileName = `KwikCabs_Commission_${lead._id.toString().slice(-6).toUpperCase()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const pdfGenerator = require('../utils/pdfGenerator');
        await pdfGenerator.generateDriverCommissionReceipt(lead, res);
    } catch (error) {
        console.error("Commission Receipt generation error:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating commission receipt" });
        }
    }
};
