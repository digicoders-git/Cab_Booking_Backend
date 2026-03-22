const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Need to load models
const Admin = require('../models/Admin');
const Agent = require('../models/Agent');
const Booking = require('../models/Booking');
const CarCategory = require('../models/CarCategory');
const Driver = require('../models/Driver');
const Fleet = require('../models/Fleet');
const FleetCar = require('../models/FleetCar');
const Notification = require('../models/Notification');
const RideRequest = require('../models/RideRequest');
const Support = require('../models/Support');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

function generateSampleFromSchema(model) {
    if (!model || !model.schema) return {};
    const sample = {};
    for (const [pathName, schemaType] of Object.entries(model.schema.paths)) {
        if (['_id', '__v', 'createdAt', 'updatedAt'].includes(pathName)) continue;
        
        const keys = pathName.split('.');
        let current = sample;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        
        const lastKey = keys[keys.length - 1];
        let instance = (schemaType.instance || 'string').toLowerCase();
        
        if (instance === 'string') current[lastKey] = "Provide_String_Value";
        else if (instance === 'number') current[lastKey] = 0;
        else if (instance === 'boolean') current[lastKey] = false;
        else if (instance === 'date') current[lastKey] = new Date().toISOString();
        else if (instance === 'objectid') current[lastKey] = "60c72b2f9b1d8b001c8e4d1a";
        else if (instance === 'array') current[lastKey] = [];
        else current[lastKey] = "Provide_Value";
    }
    return sample;
}

const routeToModelMap = {
    "adminRoutes.js": Admin,
    "userRoutes.js": User,
    "agentRoutes.js": Agent,
    "driverRoutes.js": Driver,
    "fleetRoutes.js": Fleet,
    "fleetDriverRoutes.js": Driver, 
    "fleetCarRoutes.js": FleetCar,
    "fleetAssignmentRoutes.js": FleetCar, 
    "carCategoryRoutes.js": CarCategory,
    "bookingRoutes.js": Booking,
    "tripRoutes.js": RideRequest,
    "notificationRoutes.js": Notification,
    "walletRoutes.js": Transaction,
    "supportRoutes.js": Support
};

const routeMap = {
    "adminRoutes.js": "/api/admin",
    "userRoutes.js": "/api/users",
    "agentRoutes.js": "/api/agents",
    "driverRoutes.js": "/api/drivers",
    "fleetRoutes.js": "/api/fleet",
    "fleetDriverRoutes.js": "/api/fleet/drivers",
    "fleetCarRoutes.js": "/api/fleet/cars",
    "fleetAssignmentRoutes.js": "/api/fleet/assignment",
    "carCategoryRoutes.js": "/api/car-categories",
    "bookingRoutes.js": "/api/bookings",
    "tripRoutes.js": "/api/trips",
    "notificationRoutes.js": "/api/notifications",
    "walletRoutes.js": "/api/wallet",
    "supportRoutes.js": "/api/support"
};

function determinePanel(basePath, endpoint, fullLine) {
    const fullPath = basePath + endpoint;
    const lowerLine = fullLine.toLowerCase();
    
    // Explicit Role Middleware Checks
    if (lowerLine.includes('adminonly')) return "Admin Panel";
    if (lowerLine.includes('fleetonly')) return "Fleet Panel";
    if (lowerLine.includes('driveronly')) return "Driver App";

    // Path Pattern Checks
    if (fullPath.includes('/api/admin')) return "Admin Panel";
    if (fullPath.includes('/api/fleet')) return "Fleet Panel";
    if (fullPath.includes('/api/agents')) return "Agent Panel";
    if (fullPath.includes('/api/drivers')) return "Driver App";
    if (fullPath.includes('/api/users')) return "User App";
    
    // Shared Services Mapping (Based on likely primary usage)
    if (fullPath.includes('/api/bookings')) return "Bookings & Ride Services (Users/Agents)";
    if (fullPath.includes('/api/trips')) return "Trip Execution Services (Mostly Driver)";
    if (fullPath.includes('/api/wallet')) return "Wallet & Payouts (Common)";
    if (fullPath.includes('/api/support')) return "Support & Helpdesk (Common)";
    if (fullPath.includes('/api/notifications')) return "Notifications (Common)";
    if (fullPath.includes('/api/car-categories')) return "Common Setup APIs";

    return "General Operations";
}

const routesDir = path.join(__dirname, '../routes');
const outputJson = {
    info: {
        name: "CapBooking RAW Model APIs (Categorized By Panel)",
        description: "Contains all A to Z fields from the MongoDB Models, properly categorized logically.",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    item: []
};

// Store items temporarily to group them
const panelGroups = {};

for (const [file, basePath] of Object.entries(routeMap)) {
    const filePath = path.join(routesDir, file);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const regex = /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
    
    const ModelClass = routeToModelMap[file];
    const samplePayload = ModelClass ? generateSampleFromSchema(ModelClass) : {};

    let match;
    while ((match = regex.exec(content)) !== null) {
        // Extract the full matching line to check for middleware like 'adminOnly'
        const lineStart = content.lastIndexOf('\n', match.index) + 1;
        let lineEnd = content.indexOf('\n', match.index);
        if (lineEnd === -1) lineEnd = content.length;
        const fullLine = content.substring(lineStart, lineEnd);

        const method = match[1].toUpperCase();
        let endpoint = match[2];
        if (endpoint === '/') endpoint = ''; 
        
        const fullPath = `http://localhost:5000${basePath}${endpoint}`;
        const pathSegments = (basePath + endpoint).split('/').filter(Boolean);

        const panelName = determinePanel(basePath, endpoint, fullLine);
        
        if (!panelGroups[panelName]) {
            panelGroups[panelName] = [];
        }

        const apiItem = {
            name: `${method} ${basePath}${endpoint}`,
            request: {
                method: method,
                header: [
                    { key: "Authorization", value: "Bearer YOUR_TOKEN_HERE", type: "text" },
                    { key: "Content-Type", value: "application/json", type: "text" }
                ],
                url: {
                    raw: fullPath,
                    protocol: "http",
                    host: ["localhost"],
                    port: "5000",
                    path: pathSegments
                }
            },
            response: []
        };
        
        // Add FULL mongoose model payload to POST and PUT requests
        if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && Object.keys(samplePayload).length > 0) {
            apiItem.request.body = {
                mode: "raw",
                raw: JSON.stringify(samplePayload, null, 4),
                options: { raw: { language: "json" } }
            };
        }

        panelGroups[panelName].push(apiItem);
    }
}

// Convert the grouped mapping into the Postman folder Structure
for (const [panelName, apiItems] of Object.entries(panelGroups)) {
    outputJson.item.push({
        name: panelName,
        item: apiItems
    });
}

const outputPath = path.join(__dirname, '../CapBooking_RAW_Model_APIs.json');
fs.writeFileSync(outputPath, JSON.stringify(outputJson, null, 4));
console.log(`Successfully generated Panel-based Full Model Postman Collection at: ${outputPath}`);
process.exit(0);
