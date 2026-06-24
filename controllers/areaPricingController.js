const AreaPricing = require("../models/AreaPricing");

// 1. Create Area Pricing
exports.createAreaPricing = async (req, res) => {
    try {
        const area = await AreaPricing.create(req.body);
        res.status(201).json({ success: true, area });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Get All Area Pricings
exports.getAllAreaPricings = async (req, res) => {
    try {
        const areas = await AreaPricing.find().sort({ createdAt: -1 });
        res.json({ success: true, areas });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Update Area Pricing
exports.updateAreaPricing = async (req, res) => {
    try {
        const area = await AreaPricing.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!area) return res.status(404).json({ success: false, message: "Area not found" });
        res.json({ success: true, area });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Delete Area Pricing
exports.deleteAreaPricing = async (req, res) => {
    try {
        const area = await AreaPricing.findByIdAndDelete(req.params.id);
        if (!area) return res.status(404).json({ success: false, message: "Area not found" });
        res.json({ success: true, message: "Area deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5. Auto-Expire Background Task
exports.autoExpireAreaPricing = async () => {
    try {
        const now = new Date();
        const result = await AreaPricing.updateMany(
            { 
                isActive: true, 
                validUntil: { $ne: null, $lte: now } 
            },
            { 
                $set: { isActive: false } 
            }
        );
        
        if (result.modifiedCount > 0) {
            console.log(`⏰ [CRON] Auto-expired ${result.modifiedCount} Area Pricing rule(s).`);
        }
    } catch (error) {
        console.error("Error auto-expiring area pricing:", error.message);
    }
};

