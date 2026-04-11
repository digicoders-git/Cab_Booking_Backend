const ServiceArea = require("../models/ServiceArea");

// 1. Get all service areas
exports.getAllServiceAreas = async (req, res) => {
    try {
        const areas = await ServiceArea.find().sort({ createdAt: -1 });
        res.json({ success: true, count: areas.length, areas });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Create new service area
exports.createServiceArea = async (req, res) => {
    try {
        const { cityName, pincodes } = req.body;
        
        if (!cityName) return res.status(400).json({ success: false, message: "City name is required" });

        const existing = await ServiceArea.findOne({ cityName: cityName.trim() });
        if (existing) return res.status(400).json({ success: false, message: "City already exists in service areas" });

        const newArea = await ServiceArea.create({
            cityName: cityName.trim(),
            pincodes: pincodes || [],
            createdBy: req.user ? req.user.id : null
        });

        res.status(201).json({ success: true, message: "Service area added successfully", area: newArea });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Update service area
exports.updateServiceArea = async (req, res) => {
    try {
        const { cityName, pincodes, isActive } = req.body;
        const area = await ServiceArea.findByIdAndUpdate(
            req.params.id,
            { cityName, pincodes, isActive },
            { new: true }
        );

        if (!area) return res.status(404).json({ success: false, message: "Area not found" });

        res.json({ success: true, message: "Service area updated", area });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Delete service area
exports.deleteServiceArea = async (req, res) => {
    try {
        const area = await ServiceArea.findByIdAndDelete(req.params.id);
        if (!area) return res.status(404).json({ success: false, message: "Area not found" });

        res.json({ success: true, message: "Service area deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5. Internal check for booking serviceability
exports.checkServiceAvailability = async (address) => {
    try {
        console.log("-----------------------------------------");
        console.log("🔍 [SERVICE CHECK] Incoming Address:", address);

        if (!address) {
            console.log("❌ [SERVICE CHECK] Address is empty!");
            return false;
        }
        
        const activeAreas = await ServiceArea.find({ isActive: true });
        const lowerAddress = (typeof address === 'object' ? (address.address || address.name || "") : address).toLowerCase();

        console.log("📍 [SERVICE CHECK] Normalized String for matching:", lowerAddress);

        for (const area of activeAreas) {
            // Check city name match
            const cityMatch = lowerAddress.includes(area.cityName.toLowerCase());
            
            // Check pincode match
            const matchedPin = area.pincodes.find(pin => lowerAddress.includes(pin));

            if (cityMatch || matchedPin) {
                console.log(`✅ [SERVICE CHECK] MATCH FOUND!`);
                console.log(`   - City: ${area.cityName} (Match: ${cityMatch})`);
                console.log(`   - Pincode: ${matchedPin || 'None'} (Match: ${!!matchedPin})`);
                console.log("-----------------------------------------");
                return true;
            }
        }

        console.log("🚫 [SERVICE CHECK] NO MATCH FOUND. Service Denied.");
        console.log("-----------------------------------------");
        return false;
    } catch (err) {
        console.error("🔥 [SERVICE CHECK] ERROR:", err.message);
        return false;
    }
};
