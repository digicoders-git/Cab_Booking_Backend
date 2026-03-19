const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const BASE_URL = 'http://localhost:5000/api';

function makeRequest(path, method, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const body = data ? JSON.stringify(data) : "";
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;
        if (body) options.headers['Content-Length'] = Buffer.byteLength(body);

        const req = http.request(options, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: resData });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function run() {
    try {
        console.log("--- Step 1: Connecting to MongoDB ---");
        await mongoose.connect(process.env.MONGO_URI);

        const Fleet = require('./models/Fleet');
        const CarCategory = require('./models/CarCategory');
        const Driver = require('./models/Driver');
        const FleetCar = require('./models/FleetCar');

        let fleet = await Fleet.findOne({ email: "fleet_test@example.com" });
        if (!fleet) {
            fleet = await Fleet.create({
                name: "Test Fleet 2",
                email: "fleet_test2@example.com",
                password: "password123",
                phone: "9123456782",
                companyName: "Test Logistics 2",
                address: "Sector 5", city: "Noida", state: "UP", pincode: "201301"
            });
            console.log("New Fleet Created: fleet_test2@example.com");
        }

        const fleetToken = jwt.sign({ id: fleet._id, role: "fleet" }, process.env.JWT_SECRET);
        const cat = await CarCategory.findOne({}) || { _id: "69b848b685e75e2dec1d09b6" };

        console.log("\n--- Step 2: Create a Fleet Car ---");
        let carRes = await makeRequest('/api/fleet/cars/create', 'POST', {
            carNumber: "UP32-FLEET-88",
            carModel: "Bolero Neo",
            carBrand: "Mahindra",
            carType: cat._id
        }, fleetToken);
        
        if (carRes.status === 201) {
            console.log("Fleet Car Created Successfully!");
        } else {
            console.log("Car exist or Error:", carRes.data.message);
            const car = await FleetCar.findOne({ carNumber: "UP32-FLEET-88" });
            carRes.data.car = car;
        }

        const carId = carRes.data.car._id;

        console.log("\n--- Step 3: Create a Fleet Driver ---");
        let driverRes = await makeRequest('/api/fleet/drivers/create', 'POST', {
            name: "Ramesh Fleet Driver",
            email: "ramesh_fleet_88@example.com",
            phone: "9100000088",
            password: "password123",
            licenseNumber: "LIC-F-88"
        }, fleetToken);

        if (driverRes.status === 201) {
            console.log("Fleet Driver Created Successfully!");
        } else {
            console.log("Driver exist or Error:", driverRes.data.message);
            const dr = await Driver.findOne({ email: "ramesh_fleet_88@example.com" });
            driverRes.data.driver = dr;
        }

        const driverId = driverRes.data.driver._id;

        console.log("\n--- Step 4: Assign Car to Fleet Driver ---");
        let assignRes = await makeRequest('/api/fleet/assignment/assign', 'POST', {
            driverId: driverId,
            carId: carId
        }, fleetToken);
        console.log("Assignment Result:", assignRes.data.message);

        console.log("\n--- Step 5: Create a Normal Driver (Public) ---");
        let normalRes = await makeRequest('/api/drivers/register', 'POST', {
            name: "Suresh Normal Driver",
            email: "suresh_norm_88@example.com",
            phone: "9100000089",
            password: "password123",
            licenseNumber: "LIC-N-88",
            carNumber: "UP32-NORM-88",
            carModel: "Swift",
            carBrand: "Maruti",
            carType: cat._id
        });
        console.log("Normal Driver Result:", normalRes.data.message);

        console.log("\n✅ ALL STEPS COMPLETED!");
        process.exit(0);

    } catch (error) {
        console.error("CRITICAL ERROR:", error.message);
        process.exit(1);
    }
}

run();
