const Agent = require("../models/Agent");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const { isEmailTaken, isPhoneTaken } = require("../utils/globalUniqueness");
const { Parser } = require("json2csv");

// Create Agent (Admin Only)
exports.registerAgent = async (req, res) => {
    try {
        const { 
            name, email, phone, password, commissionPercentage, 
            address, city, state, pincode,
            aadharNumber, panNumber,
            accountNumber, ifscCode, accountHolderName, bankName 
        } = req.body;

        const image = req.files?.image ? req.files.image[0].filename : null;
        const aadhar = req.files?.aadhar ? req.files.aadhar[0].filename : null;
        const pan = req.files?.pan ? req.files.pan[0].filename : null;

        // Check if email already exists
        const emailExist = await Agent.findOne({ email });
        if (emailExist) {
            return res.status(400).json({ success: false, message: "Email is already registered" });
        }

        // Check if phone already exists
        const phoneExist = await Agent.findOne({ phone });
        if (phoneExist) {
            return res.status(400).json({ success: false, message: "Phone number is already registered" });
        }

        const agent = await Agent.create({
            name,
            email,
            phone,
            password,
            image,
            commissionPercentage: commissionPercentage || 10,
            address,
            city,
            state,
            pincode,
            aadharNumber,
            panNumber,
            documents: { aadhar, pan },
            bankDetails: {
                accountNumber,
                ifscCode,
                accountHolderName,
                bankName
            },
            isActive: true,
            createdBy: req.user.id
        });

        res.status(201).json({
            success: true,
            message: "Agent created successfully by Admin",
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Login Agent
exports.loginAgent = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const agent = await Agent.findOne({ email });

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        if (!agent.isActive) {
            return res.status(403).json({
                success: false,
                message: "Your account has been deactivated by Admin"
            });
        }

        if (agent.password !== password) {
            return res.status(400).json({
                success: false,
                message: "Invalid password"
            });
        }

        const token = jwt.sign(
            {
                id: agent._id,
                role: "agent"
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Get Agent Profile
exports.getAgentProfile = async (req, res) => {
    try {
        const agent = await Agent.findById(req.user.id).select("-password");

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        res.json({
            success: true,
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

// Get Agent Dashboard Stats
exports.getAgentDashboard = async (req, res) => {
    try {
        const Booking = require("../models/Booking");
        const Transaction = require("../models/Transaction");
        const agent = await Agent.findById(req.user.id);

        if (!agent) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }

        // Fetch bookings for counts and trends
        const bookings = await Booking.find({ agent: req.user.id });
        const totalBookings = bookings.length;
        const pendingBookings = bookings.filter(b => b.bookingStatus === "Pending").length;
        const acceptedBookings = bookings.filter(b => b.bookingStatus === "Accepted").length;
        const ongoingBookings = bookings.filter(b => b.bookingStatus === "Ongoing").length;
        const completedBookings = bookings.filter(b => b.bookingStatus === "Completed").length;
        const cancelledBookings = bookings.filter(b => b.bookingStatus === "Cancelled").length;
        const expiredBookings = bookings.filter(b => b.bookingStatus === "Expired").length;
        
        // Count active bookings (Pending or Accepted or Ongoing)
        const activeBookings = pendingBookings + acceptedBookings + ongoingBookings;

        // Recent 5 Bookings for the dashboard
        const recentBookings = [...bookings]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5)
            .map(b => ({
                _id: b._id,
                passengerDetails: b.passengerDetails,
                pickup: b.pickup,
                drop: b.drop,
                fareEstimate: b.fareEstimate,
                bookingStatus: b.bookingStatus,
                createdAt: b.createdAt
            }));

        // Date math for Trends
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const fourteenDaysAgo = new Date(sevenDaysAgo);
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 7);

        const recentTransactions = await Transaction.find({
            user: req.user.id,
            userModel: 'Agent',
            category: { $in: ['Ride Earning', 'Commission'] },
            status: 'Completed',
            createdAt: { $gte: sevenDaysAgo }
        }).sort({ createdAt: 1 });

        // Weekly Trend
        const thisWeekBookings = bookings.filter(b => b.createdAt >= sevenDaysAgo).length;
        const lastWeekBookings = bookings.filter(b => b.createdAt >= fourteenDaysAgo && b.createdAt < sevenDaysAgo).length;
        const thisWeekEarnings = recentTransactions.reduce((sum, t) => sum + t.amount, 0);
        
        const lastWeekTransactions = await Transaction.find({
            user: req.user.id,
            userModel: 'Agent',
            category: { $in: ['Ride Earning', 'Commission'] },
            status: 'Completed',
            createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }
        });
        const lastWeekEarnings = lastWeekTransactions.reduce((sum, t) => sum + t.amount, 0);

        const weeklyTrend = {
            bookings: {
                thisWeek: thisWeekBookings,
                lastWeek: lastWeekBookings,
                percentageChange: lastWeekBookings === 0 ? 100 : Math.round(((thisWeekBookings - lastWeekBookings) / lastWeekBookings) * 100)
            },
            earnings: {
                thisWeek: thisWeekEarnings,
                lastWeek: lastWeekEarnings,
                percentageChange: lastWeekEarnings === 0 ? 100 : Math.round(((thisWeekEarnings - lastWeekEarnings) / lastWeekEarnings) * 100)
            }
        };

        // Peak Hours
        const peakHoursMap = {};
        for(let i=0; i<24; i++) peakHoursMap[i] = 0;

        bookings.forEach(b => {
            const hour = new Date(b.createdAt).getHours();
            peakHoursMap[hour]++;
        });

        const peakHours = Object.keys(peakHoursMap).map(hour => ({
            hour: parseInt(hour),
            count: peakHoursMap[hour],
            label: `${hour}:00 - ${parseInt(hour)+1}:00`
        })).sort((a,b) => b.count - a.count);

        // Monthly Trend
        const monthlyTrendMap = {}; 
        
        for(let i=5; i>=0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyTrendMap[monthStr] = { month: monthStr, bookings: 0, earnings: 0 };
        }

        bookings.forEach(b => {
            const monthStr = `${new Date(b.createdAt).getFullYear()}-${String(new Date(b.createdAt).getMonth() + 1).padStart(2, '0')}`;
            if(monthlyTrendMap[monthStr]) {
                monthlyTrendMap[monthStr].bookings++;
            }
        });

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1); 
        sixMonthsAgo.setHours(0,0,0,0);

        const sixMonthsTransactions = await Transaction.find({
            user: req.user.id,
            userModel: 'Agent',
            category: { $in: ['Ride Earning', 'Commission'] },
            status: 'Completed',
            createdAt: { $gte: sixMonthsAgo }
        });

        sixMonthsTransactions.forEach(t => {
            const monthStr = `${new Date(t.createdAt).getFullYear()}-${String(new Date(t.createdAt).getMonth() + 1).padStart(2, '0')}`;
            if(monthlyTrendMap[monthStr]) {
                monthlyTrendMap[monthStr].earnings += t.amount;
            }
        });

        const monthlyTrend = Object.values(monthlyTrendMap);

        res.json({
            success: true,
            dashboard: {
                name: agent.name,
                image: agent.image || "",
                totalBookings,
                activeBookings,
                pendingBookings,
                ongoingBookings,
                completedBookings,
                cancelledBookings,
                expiredBookings,
                totalEarnings: agent.totalEarnings || 0,
                walletBalance: agent.walletBalance || 0,
                commissionPercentage: agent.commissionPercentage,
                recentBookings,
                weeklyTrend,
                peakHours: peakHours.slice(0, 5),
                monthlyTrend
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching agent dashboard",
            error: error.message
        });
    }
};

// Get Agent Detailed Report (Includes 7-day earnings & total withdrawn)
exports.getAgentReport = async (req, res) => {
    try {
        const Booking = require("../models/Booking");
        const Transaction = require("../models/Transaction");
        const agent = await Agent.findById(req.user.id);

        if (!agent) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }

        // 1. Booking Status Counts
        const bookings = await Booking.find({ agent: req.user.id });
        const bookingStats = {
            total: bookings.length,
            pending: bookings.filter(b => b.bookingStatus === "Pending").length,
            accepted: bookings.filter(b => b.bookingStatus === "Accepted").length,
            ongoing: bookings.filter(b => b.bookingStatus === "Ongoing").length,
            completed: bookings.filter(b => b.bookingStatus === "Completed").length,
            cancelled: bookings.filter(b => b.bookingStatus === "Cancelled").length,
            expired: bookings.filter(b => b.bookingStatus === "Expired").length
        };

        // 2. Financial Summaries
        const totalEarnings = agent.totalEarnings || 0;
        const walletBalance = agent.walletBalance || 0;
        
        // Calculate Total Withdrawn
        const withdrawals = await Transaction.find({
            user: req.user.id,
            userModel: 'Agent',
            category: 'Withdrawal',
            status: 'Completed'
        });
        const totalWithdrawn = withdrawals.reduce((sum, t) => sum + t.amount, 0);

        // 3. Daily Earnings History (Last 7 Days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const recentTransactions = await Transaction.find({
            user: req.user.id,
            userModel: 'Agent',
            category: { $in: ['Ride Earning', 'Commission'] },
            status: 'Completed',
            createdAt: { $gte: sevenDaysAgo }
        }).sort({ createdAt: 1 });

        // Group by Date (YYYY-MM-DD)
        const dailyEarningsMap = {};
        for(let i=6; i>=0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateString = date.toISOString().split('T')[0];
            dailyEarningsMap[dateString] = 0;
        }

        recentTransactions.forEach(t => {
            const dateString = new Date(t.createdAt).toISOString().split('T')[0];
            if(dailyEarningsMap[dateString] !== undefined) {
                dailyEarningsMap[dateString] += t.amount;
            }
        });

        const dailyEarningsHistory = Object.keys(dailyEarningsMap).map(date => ({
            date,
            earnings: dailyEarningsMap[date]
        }));

        // 4. Weekly Trend (Current 7 Days vs Previous 7 Days)
        const fourteenDaysAgo = new Date(sevenDaysAgo);
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 7);

        const thisWeekBookings = bookings.filter(b => b.createdAt >= sevenDaysAgo).length;
        const lastWeekBookings = bookings.filter(b => b.createdAt >= fourteenDaysAgo && b.createdAt < sevenDaysAgo).length;

        const thisWeekEarnings = recentTransactions.reduce((sum, t) => sum + t.amount, 0);
        
        const lastWeekTransactions = await Transaction.find({
            user: req.user.id,
            userModel: 'Agent',
            category: { $in: ['Ride Earning', 'Commission'] },
            status: 'Completed',
            createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }
        });
        const lastWeekEarnings = lastWeekTransactions.reduce((sum, t) => sum + t.amount, 0);

        const weeklyTrend = {
            bookings: {
                thisWeek: thisWeekBookings,
                lastWeek: lastWeekBookings,
                percentageChange: lastWeekBookings === 0 ? 100 : Math.round(((thisWeekBookings - lastWeekBookings) / lastWeekBookings) * 100)
            },
            earnings: {
                thisWeek: thisWeekEarnings,
                lastWeek: lastWeekEarnings,
                percentageChange: lastWeekEarnings === 0 ? 100 : Math.round(((thisWeekEarnings - lastWeekEarnings) / lastWeekEarnings) * 100)
            }
        };

        // 5. Peak Hours (Group bookings by Hour 0-23)
        const peakHoursMap = {};
        for(let i=0; i<24; i++) peakHoursMap[i] = 0;

        bookings.forEach(b => {
            const hour = new Date(b.createdAt).getHours();
            peakHoursMap[hour]++;
        });

        const peakHours = Object.keys(peakHoursMap).map(hour => ({
            hour: parseInt(hour),
            count: peakHoursMap[hour],
            label: `${hour}:00 - ${parseInt(hour)+1}:00`
        })).sort((a,b) => b.count - a.count); // sort by highest count

        // 6. Monthly Trend (Last 6 Months)
        const monthlyTrendMap = {}; // Format: "YYYY-MM": { bookings: 0, earnings: 0 }
        
        // Generate last 6 months keys
        for(let i=5; i>=0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyTrendMap[monthStr] = { month: monthStr, bookings: 0, earnings: 0 };
        }

        bookings.forEach(b => {
            const monthStr = `${new Date(b.createdAt).getFullYear()}-${String(new Date(b.createdAt).getMonth() + 1).padStart(2, '0')}`;
            if(monthlyTrendMap[monthStr]) {
                monthlyTrendMap[monthStr].bookings++;
            }
        });

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1); // First day of 6th past month
        sixMonthsAgo.setHours(0,0,0,0);

        const sixMonthsTransactions = await Transaction.find({
            user: req.user.id,
            userModel: 'Agent',
            category: { $in: ['Ride Earning', 'Commission'] },
            status: 'Completed',
            createdAt: { $gte: sixMonthsAgo }
        });

        sixMonthsTransactions.forEach(t => {
            const monthStr = `${new Date(t.createdAt).getFullYear()}-${String(new Date(t.createdAt).getMonth() + 1).padStart(2, '0')}`;
            if(monthlyTrendMap[monthStr]) {
                monthlyTrendMap[monthStr].earnings += t.amount;
            }
        });

        const monthlyTrend = Object.values(monthlyTrendMap);

        res.json({
            success: true,
            report: {
                bookingStats,
                financials: {
                    walletBalance,
                    totalEarnings,
                    totalWithdrawn,
                    commissionPercentage: agent.commissionPercentage
                },
                dailyEarningsHistory,
                weeklyTrend,
                peakHours: peakHours.slice(0, 5), // Top 5 peak hours
                monthlyTrend
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching agent report",
            error: error.message
        });
    }
};
// Download Agent Report (PDF/CSV)
exports.downloadAgentReport = async (req, res) => {
    try {
        const Booking = require("../models/Booking");
        const Transaction = require("../models/Transaction");
        const agent = await Agent.findById(req.user.id);

        if (!agent) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }

        const format = req.query.format || "pdf";

        // Fetch basic data for report
        const bookings = await Booking.find({ agent: req.user.id }).sort({ createdAt: -1 });

        if (format === "csv") {
            const fields = ["Booking ID", "Date", "Status", "Passenger Name", "Fare"];
            const data = bookings.map(b => ({
                "Booking ID": b._id.toString(),
                "Date": new Date(b.createdAt).toLocaleDateString(),
                "Status": b.bookingStatus,
                "Passenger Name": b.passengerDetails?.name || "N/A",
                "Fare": b.actualFare || b.fareEstimate || 0
            }));

            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(data);

            res.header('Content-Type', 'text/csv');
            res.attachment(`Agent_Report_${new Date().toISOString().split('T')[0]}.csv`);
            return res.send(csv);
        }

        if (format === "pdf") {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename=Agent_Report_${new Date().toISOString().split('T')[0]}.pdf`);
            doc.pipe(res);

            // Header Background & Title
            doc.rect(0, 0, doc.page.width, 100).fill("#1A202C");
            doc.fillColor("#FFFFFF").fontSize(26).font("Helvetica-Bold").text("CAPBOKKIN", 50, 30);
            doc.fillColor("#A0AEC0").fontSize(12).font("Helvetica").text("Official Agent Performance Report", 50, 60);

            // Agent Info Box
            doc.fillOpacity(0.05).rect(50, 120, doc.page.width - 100, 80).fill("#3182CE");
            doc.fillOpacity(1);
            doc.fillColor("#2D3748").fontSize(16).font("Helvetica-Bold").text("Agent Profile", 70, 135);
            doc.fontSize(12).font("Helvetica").text(`Name: ${agent.name}`, 70, 160);
            doc.text(`Email: ${agent.email}`, 70, 175);
            doc.font("Helvetica-Bold").fillColor("#4A5568").text(`Generated On: ${new Date().toLocaleDateString()}`, doc.page.width - 250, 160);

            // Summary Stats Section with Colored Boxes
            doc.fillColor("#2D3748").fontSize(18).font("Helvetica-Bold").text("Financial Summary", 50, 230);
            
            // Box 1: Total Bookings
            doc.rect(50, 255, 140, 70).fill("#EBF8FF");
            doc.lineWidth(1).strokeColor("#BEE3F8").rect(50, 255, 140, 70).stroke();
            doc.fillColor("#2B6CB0").fontSize(12).font("Helvetica-Bold").text("Total Bookings", 60, 265);
            doc.fillColor("#2D3748").fontSize(20).text(bookings.length.toString(), 60, 290);

            // Box 2: Total Earnings
            doc.rect(205, 255, 140, 70).fill("#F0FFF4");
            doc.lineWidth(1).strokeColor("#C6F6D5").rect(205, 255, 140, 70).stroke();
            doc.fillColor("#2F855A").fontSize(12).font("Helvetica-Bold").text("Total Earnings", 215, 265);
            doc.fillColor("#2D3748").fontSize(20).text(`INR ${agent.totalEarnings || 0}`, 215, 290);

            // Box 3: Wallet Balance
            doc.rect(360, 255, 140, 70).fill("#FFFFF0");
            doc.lineWidth(1).strokeColor("#FEFCBF").rect(360, 255, 140, 70).stroke();
            doc.fillColor("#B7791F").fontSize(12).font("Helvetica-Bold").text("Wallet Balance", 370, 265);
            doc.fillColor("#2D3748").fontSize(20).text(`INR ${agent.walletBalance || 0}`, 370, 290);

            // Recent Bookings Table
            let tableTop = 370;
            doc.fillColor("#2D3748").fontSize(18).font("Helvetica-Bold").text("Recent Rides (Top 10)", 50, tableTop - 30);
            
            // Table Header Background
            doc.rect(50, tableTop, doc.page.width - 100, 30).fill("#2D3748");
            
            // Table Headers
            const col1 = 60, col2 = 180, col3 = 310, col4 = 430;
            doc.fillColor("#FFFFFF").fontSize(12).font("Helvetica-Bold");
            doc.text("Date", col1, tableTop + 10);
            doc.text("Passenger", col2, tableTop + 10);
            doc.text("Status", col3, tableTop + 10);
            doc.text("Fare (INR)", col4, tableTop + 10);

            doc.font("Helvetica").fontSize(10);
            const recent10 = bookings.slice(0, 10);
            let y = tableTop + 40;

            recent10.forEach((b, i) => {
                // Add page if content goes beyond limit
                if (y > doc.page.height - 100) {
                    doc.addPage();
                    y = 50;
                }
                
                // Alternate row color for readability (Zebra striping)
                if (i % 2 === 0) {
                    doc.rect(50, y - 5, doc.page.width - 100, 25).fill("#F7FAFC");
                }
                
                doc.fillColor("#4A5568");
                doc.text(new Date(b.createdAt).toLocaleDateString(), col1, y);
                doc.text(b.passengerDetails?.name || "No User", col2, y, { width: 120, ellipsis: true });
                
                // Conditional Status Color Logic
                let statusColor = "#4A5568";
                if(b.bookingStatus === "Completed") statusColor = "#38A169"; // Green
                if(b.bookingStatus === "Cancelled" || b.bookingStatus === "Expired") statusColor = "#E53E3E"; // Red
                if(b.bookingStatus === "Ongoing" || b.bookingStatus === "Accepted") statusColor = "#3182CE"; // Blue
                
                doc.fillColor(statusColor).font("Helvetica-Bold").text(b.bookingStatus, col3, y);
                doc.fillColor("#4A5568").font("Helvetica").text(`₹ ${b.actualFare || b.fareEstimate || 0}`, col4, y);
                
                y += 25;
            });

            // Footer removed as requested

            doc.end();
            return;
        }

        return res.status(400).json({ success: false, message: "Invalid format. Use ?format=pdf or ?format=csv" });

    } catch (error) {
        console.error("Download Error:", error);
        res.status(500).json({ success: false, message: "Error generating report", error: error.message });
    }
};

// Update Agent Profile (Including Documents)
exports.updateAgentProfile = async (req, res) => {
    try {
        const { name, email, phone, password, address, city, state, pincode, accountNumber, ifscCode, accountHolderName, bankName, aadharNumber, panNumber } = req.body;
        const id = req.user.id;
        const agentRecord = await Agent.findById(id);
        if (!agentRecord) return res.status(404).json({ success: false, message: "Agent not found" });

        // Check global email uniqueness if changed
        if (email && email !== agentRecord.email) {
            const emailTakenBy = await isEmailTaken(email, id);
            if (emailTakenBy) return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }

        // Check global phone uniqueness if changed
        if (phone && phone !== agentRecord.phone) {
            const phoneTakenBy = await isPhoneTaken(phone, id);
            if (phoneTakenBy) return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
        }

        const updateData = {
            name,
            email,
            phone,
            address,
            city,
            state,
            pincode,
            aadharNumber,
            panNumber
        };

        if (password) {
            updateData.password = password;
        }

        if (accountNumber || ifscCode || accountHolderName || bankName) {
            updateData.bankDetails = {
                accountNumber: accountNumber || agentRecord.bankDetails?.accountNumber,
                ifscCode: ifscCode || agentRecord.bankDetails?.ifscCode,
                accountHolderName: accountHolderName || agentRecord.bankDetails?.accountHolderName,
                bankName: bankName || agentRecord.bankDetails?.bankName
            };
        }

        if (req.files) {
            if (req.files.image) updateData.image = req.files.image[0].filename;
            
            if (req.files.aadhar || req.files.pan) {
                updateData.documents = {
                    aadhar: req.files.aadhar ? req.files.aadhar[0].filename : agentRecord.documents?.aadhar,
                    pan: req.files.pan ? req.files.pan[0].filename : agentRecord.documents?.pan
                };
            }
        }

        const agent = await Agent.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true }
        ).select("-password");

        res.json({
            success: true,
            message: "Profile updated successfully",
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};



// Get All Agents (Admin Only)
exports.getAllAgents = async (req, res) => {
    try {
        const agents = await Agent.find().populate("createdBy", "name email");

        res.json({
            success: true,
            count: agents.length,
            agents
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching agents",
            error: error.message
        });
    }
};

// Get Single Agent (Admin Only)
exports.getSingleAgent = async (req, res) => {
    try {
        const agent = await Agent.findById(req.params.id).populate("createdBy", "name email");

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        res.json({
            success: true,
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching agent",
            error: error.message
        });
    }
};

// Delete Agent (Admin Only)
exports.deleteAgent = async (req, res) => {
    try {
        const agent = await Agent.findByIdAndDelete(req.params.id);

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        res.json({
            success: true,
            message: "Agent deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting agent",
            error: error.message
        });
    }
};

// Toggle Agent Status (Admin Only)
exports.toggleAgentStatus = async (req, res) => {
    try {
        const agent = await Agent.findById(req.params.id);

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        agent.isActive = !agent.isActive;
        await agent.save();

        res.json({
            success: true,
            message: `Agent is now ${agent.isActive ? 'Active' : 'Deactivated'}`,
            isActive: agent.isActive
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error toggling status",
            error: error.message
        });
    }
};

// Update Agent Commission (Admin Only)
exports.updateCommission = async (req, res) => {
    try {
        const { commissionPercentage } = req.body;

        if (!commissionPercentage || commissionPercentage < 0 || commissionPercentage > 100) {
            return res.status(400).json({
                success: false,
                message: "Invalid commission percentage (0-100)"
            });
        }

        const agent = await Agent.findByIdAndUpdate(
            req.params.id,
            { commissionPercentage },
            { new: true }
        ).select("-password");

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        res.json({
            success: true,
            message: "Commission updated successfully",
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating commission",
            error: error.message
        });
    }
};

// Update Agent (Admin Only)
exports.adminUpdateAgent = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name, email, phone, password, commissionPercentage,
            address, city, state, pincode, aadharNumber, panNumber,
            accountNumber, ifscCode, accountHolderName, bankName
        } = req.body;

        const agent = await Agent.findById(id);

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent not found"
            });
        }

        // Check global email uniqueness if changed
        if (email && email !== agent.email) {
            const emailTakenBy = await isEmailTaken(email, id);
            if (emailTakenBy) return res.status(400).json({ success: false, message: `Email is already registered as ${emailTakenBy}` });
        }

        // Check global phone uniqueness if changed
        if (phone && phone !== agent.phone) {
            const phoneTakenBy = await isPhoneTaken(phone, id);
            if (phoneTakenBy) return res.status(400).json({ success: false, message: `Phone number is already registered as ${phoneTakenBy}` });
        }

        // Update basic info
        if (name) agent.name = name;
        if (email) agent.email = email;
        if (phone) agent.phone = phone;
        if (password) agent.password = password;
        if (address) agent.address = address;
        if (city) agent.city = city;
        if (state) agent.state = state;
        if (pincode) agent.pincode = pincode;
        if (aadharNumber !== undefined) agent.aadharNumber = aadharNumber;
        if (panNumber !== undefined) agent.panNumber = panNumber;
        if (commissionPercentage !== undefined) agent.commissionPercentage = commissionPercentage;

        // Handle File Fields from upload.fields
        if (req.files) {
            if (req.files.image) agent.image = req.files.image[0].filename;

            if (req.files.aadhar || req.files.pan) {
                if (!agent.documents) agent.documents = {};
                if (req.files.aadhar) agent.documents.aadhar = req.files.aadhar[0].filename;
                if (req.files.pan) agent.documents.pan = req.files.pan[0].filename;
            }
        }

        // Update Bank Details if any field provided
        if (accountNumber || ifscCode || accountHolderName || bankName) {
            agent.bankDetails = {
                accountNumber: accountNumber || agent.bankDetails?.accountNumber || "",
                ifscCode: ifscCode || agent.bankDetails?.ifscCode || "",
                accountHolderName: accountHolderName || agent.bankDetails?.accountHolderName || "",
                bankName: bankName || agent.bankDetails?.bankName || ""
            };
        }

        await agent.save();

        res.json({
            success: true,
            message: "Agent updated successfully by Admin",
            agent
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating agent",
            error: error.message
        });
    }
};


