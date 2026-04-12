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

// 2. Create new service area (GPS ONLY)
exports.createServiceArea = async (req, res) => {
    try {
        const { cityName, centerLat, centerLng, radiusKm } = req.body;
        
        if (!cityName) return res.status(400).json({ success: false, message: "City name label is required" });
        if (!centerLat || !centerLng) return res.status(400).json({ success: false, message: "GPS Coordinates are mandatory" });

        const newArea = await ServiceArea.create({
            cityName: cityName.trim(),
            centerLat,
            centerLng,
            radiusKm: radiusKm || 50,
            location: {
                type: "Point",
                coordinates: [parseFloat(centerLng), parseFloat(centerLat)] // [lng, lat]
            },
            createdBy: req.user ? req.user.id : null
        });

        res.status(201).json({ success: true, message: "Service area geofence created successfully", area: newArea });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Update service area (GPS ONLY)
exports.updateServiceArea = async (req, res) => {
    try {
        const { cityName, centerLat, centerLng, radiusKm, isActive } = req.body;
        
        const updateData = { cityName, radiusKm, isActive };
        if (centerLat && centerLng) {
            updateData.centerLat = centerLat;
            updateData.centerLng = centerLng;
            updateData.location = {
                type: "Point",
                coordinates: [parseFloat(centerLng), parseFloat(centerLat)]
            };
        }

        const area = await ServiceArea.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        if (!area) return res.status(404).json({ success: false, message: "Service zone not found" });

        res.json({ success: true, message: "Service geofence updated", area });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Delete service area
exports.deleteServiceArea = async (req, res) => {
    try {
        const area = await ServiceArea.findByIdAndDelete(req.params.id);
        if (!area) return res.status(404).json({ success: false, message: "Service zone not found" });

        res.json({ success: true, message: "Service zone deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 🛰️ HIGH-PRECISION GPS SERVICE CHECK (STRICT VERSION)
 * Strictly matches Rider Latitude/Longitude against circular geofences.
 * No fallbacks for Pincodes or City Names.
 */
exports.checkServiceAvailability = async (pickupLat, pickupLng) => {
    try {
        console.log("-----------------------------------------");
        console.log(`🔍 [STRICT GPS CHECK] Rider Location: ${pickupLat}, ${pickupLng}`);

        if (!pickupLat || !pickupLng) {
            console.log("🚫 [STRICT GPS CHECK] Coordinates missing!");
            return false;
        }
        
        // Find any active service zones nearby (Max 100km sweep for optimization)
        const activeZones = await ServiceArea.find({
            isActive: true,
            location: {
                $nearSphere: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)]
                    },
                    $maxDistance: 100000 // 100 KM
                }
            }
        });

        if (activeZones.length === 0) {
            console.log("🚫 [STRICT GPS CHECK] No service zones within 100KM. Access Denied.");
            console.log("-----------------------------------------");
            return false;
        }

        // Test each nearby zone's defined radius
        for (const zone of activeZones) {
            const distance = calculateDistanceInKm(pickupLat, pickupLng, zone.centerLat, zone.centerLng);
            
            console.log(`📍 Zone Scan: ${zone.cityName} | Limit: ${zone.radiusKm}KM | Rider: ${distance.toFixed(2)}KM`);

            if (distance <= zone.radiusKm) {
                console.log(`✅ [STRICT GPS CHECK] MATCH! Riding permitted in ${zone.cityName}`);
                console.log("-----------------------------------------");
                return true;
            }
        }

        console.log("🚫 [STRICT GPS CHECK] Outside all authorized circular zones.");
        console.log("-----------------------------------------");
        return false;
    } catch (err) {
        console.error("🔥 [STRICT GPS CHECK] CRITICAL ERROR:", err.message);
        return false;
    }
};

// Helper: Haversine
function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
