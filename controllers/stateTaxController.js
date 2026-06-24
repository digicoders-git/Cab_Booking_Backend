const StateTax = require("../models/StateTax");

// 1. Admin: Create a new State Tax
exports.createStateTax = async (req, res) => {
    try {
        const { stateName, taxType, carCategory, amount, latitude, longitude } = req.body;

        if (!stateName || !carCategory || amount === undefined) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const newTax = await StateTax.create({
            stateName: stateName.toLowerCase().trim(),
            taxType: 'State Tax',
            carCategory,
            amount,
            latitude,
            longitude
        });

        res.status(201).json({ success: true, message: "State Tax created successfully", data: newTax });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Tax rule for this State and Car Category already exists." });
        }
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 2. Admin/Public: Get all State Taxes
exports.getAllStateTaxes = async (req, res) => {
    try {
        const taxes = await StateTax.find().populate('carCategory', 'name seats basePrice');
        res.json({ success: true, count: taxes.length, data: taxes });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 3. Admin: Update State Tax
exports.updateStateTax = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (updates.stateName) {
            updates.stateName = updates.stateName.toLowerCase().trim();
        }

        const updatedTax = await StateTax.findByIdAndUpdate(id, updates, { new: true });
        
        if (!updatedTax) {
            return res.status(404).json({ success: false, message: "State Tax not found" });
        }

        res.json({ success: true, message: "State Tax updated", data: updatedTax });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 4. Admin: Delete State Tax
exports.deleteStateTax = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedTax = await StateTax.findByIdAndDelete(id);

        if (!deletedTax) {
            return res.status(404).json({ success: false, message: "State Tax not found" });
        }

        res.json({ success: true, message: "State Tax deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// Internal helper for other controllers
exports.calculateTaxesInternal = async ({ pickupAddress, dropAddress, carCategoryId, tripType }) => {
    const applicableTaxes = await StateTax.find({ carCategory: carCategoryId, isActive: true });
    if (applicableTaxes.length === 0) return { totalTax: 0, taxBreakdown: [] };

    let totalTaxAmount = 0;
    let taxBreakdown = [];
    const dropStr = (dropAddress || "").toLowerCase();
    const pickupStr = (pickupAddress || "").toLowerCase();

    for (const tax of applicableTaxes) {
        const keyword = tax.stateName;

        let isCrossing = false;
        if (dropStr.includes(keyword) && !pickupStr.includes(keyword)) {
            isCrossing = true;
        } else if (dropStr.includes(keyword)) {
            isCrossing = true;
        }

        if (isCrossing) {
            if (pickupStr.includes(keyword) && dropStr.includes(keyword)) {
                continue; 
            }

            let finalAmount = tax.amount;
            if (tripType === 'RoundTrip') {
                finalAmount = tax.amount * 2;
            }

            totalTaxAmount += finalAmount;
            taxBreakdown.push({
                stateName: tax.stateName,
                taxType: tax.taxType,
                baseAmount: tax.amount,
                appliedAmount: finalAmount,
                note: tripType === 'RoundTrip' ? 'Round Trip (2x)' : 'One Way'
            });
        }
    }
    return { totalTax: totalTaxAmount, taxBreakdown };
};

// 5. Public: Calculate Taxes for a Route (API)
exports.calculateRouteTaxes = async (req, res) => {
    try {
        const { pickupAddress, dropAddress, carCategoryId, tripType } = req.body;

        if (!pickupAddress || !dropAddress || !carCategoryId) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const result = await exports.calculateTaxesInternal({ pickupAddress, dropAddress, carCategoryId, tripType });
        res.json({ success: true, ...result });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
