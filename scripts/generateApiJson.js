const fs = require('fs');
const path = require('path');

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

const routesDir = path.join(__dirname, '../routes');
const outputJson = {
    info: {
        name: "CapBooking API Collection",
        description: "Auto-generated collection of all APIs in the CapBooking project",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    item: []
};

for (const [file, basePath] of Object.entries(routeMap)) {
    const filePath = path.join(routesDir, file);
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${file}`);
        continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const regex = /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
    
    const folder = {
        name: file.replace('Routes.js', '').toUpperCase(),
        item: []
    };

    let match;
    while ((match = regex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        let endpoint = match[2];
        if (endpoint === '/') endpoint = ''; // normalize root
        
        const fullPath = `http://localhost:5000${basePath}${endpoint}`;
        
        // Postman paths array preparation
        const pathSegments = (basePath + endpoint).split('/').filter(Boolean);

        folder.item.push({
            name: `${method} ${basePath}${endpoint}`,
            request: {
                method: method,
                header: [
                    {
                        key: "Authorization",
                        value: "Bearer YOUR_TOKEN_HERE",
                        type: "text"
                    },
                    {
                        key: "Content-Type",
                        value: "application/json",
                        type: "text"
                    }
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
        });
    }

    if (folder.item.length > 0) {
        outputJson.item.push(folder);
    }
}

const outputPath = path.join(__dirname, '../CapBooking_APIs.json');
fs.writeFileSync(outputPath, JSON.stringify(outputJson, null, 4));
console.log(`Successfully generated Postman Collection at: ${outputPath}`);
