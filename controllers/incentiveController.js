const Incentive = require('../models/Incentive');
const DriverIncentiveProgress = require('../models/DriverIncentiveProgress');
const Driver = require('../models/Driver');
const Transaction = require('../models/Transaction');

// Create a new Incentive (Admin)
exports.createIncentive = async (req, res) => {
    try {
        const { title, description, targetType, targetCount, rewardAmount, startDate, endDate } = req.body;
        
        const incentive = await Incentive.create({
            title,
            description,
            targetType,
            targetCount,
            rewardAmount,
            startDate,
            endDate,
            createdBy: req.user.id
        });

        res.status(201).json({ success: true, incentive, message: "Incentive created successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all Incentives (Admin)
exports.getAllIncentives = async (req, res) => {
    try {
        const incentives = await Incentive.find().sort({ createdAt: -1 });
        res.json({ success: true, count: incentives.length, incentives });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete Incentive (Admin)
exports.deleteIncentive = async (req, res) => {
    try {
        await Incentive.findByIdAndDelete(req.params.id);
        // Optionally, could delete progress records too, but keeping them for history is fine.
        res.json({ success: true, message: "Incentive deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Driver: Get Active Incentives and Progress
exports.getDriverIncentives = async (req, res) => {
    try {
        const driverId = req.user.id;
        const now = new Date();

        // Find active incentives that are currently valid
        const activeIncentives = await Incentive.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        });

        // Find progress for this driver
        const progressList = await DriverIncentiveProgress.find({
            driver: driverId,
            incentive: { $in: activeIncentives.map(i => i._id) }
        });

        const progressMap = {};
        progressList.forEach(p => {
            progressMap[p.incentive.toString()] = p;
        });

        const result = activeIncentives.map(inc => {
            const progress = progressMap[inc._id.toString()];
            return {
                incentive: inc,
                progress: progress ? progress.progressCount : 0,
                isCompleted: progress ? progress.isCompleted : false,
                amountRewarded: progress ? progress.amountRewarded : 0
            };
        });

        res.json({ success: true, incentives: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Logic to process incentive (Called internally when a trip completes)
exports.processIncentiveForDriver = async (driverId, bookingType) => {
    try {
        const now = new Date();
        const activeIncentives = await Incentive.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        });

        for (let incentive of activeIncentives) {
            // Check if bookingType matches targetType
            if (incentive.targetType !== 'All' && incentive.targetType !== bookingType) {
                continue; // Type mismatch
            }

            // Find or create progress
            let progress = await DriverIncentiveProgress.findOne({ driver: driverId, incentive: incentive._id });
            if (!progress) {
                progress = new DriverIncentiveProgress({ driver: driverId, incentive: incentive._id });
            }

            if (!progress.isCompleted) {
                progress.progressCount += 1;
                
                // Check if target is hit
                if (progress.progressCount >= incentive.targetCount) {
                    progress.isCompleted = true;
                    progress.completedAt = new Date();
                    progress.amountRewarded = incentive.rewardAmount;

                    // Reward the driver
                    const driver = await Driver.findById(driverId);
                    if (driver) {
                        driver.walletBalance = (driver.walletBalance || 0) + incentive.rewardAmount;
                        await driver.save();

                        await Transaction.create({
                            user: driverId,
                            userModel: "Driver",
                            amount: incentive.rewardAmount,
                            type: "Credit",
                            category: "Incentive Reward",
                            description: `Reward for completing target: ${incentive.title}`,
                            status: "Completed"
                        });
                        
                        // NOTE: Push notification logic can be added here
                    }
                }
                
                await progress.save();
            }
        }
    } catch (error) {
        console.error("Error processing incentive:", error);
    }
};
