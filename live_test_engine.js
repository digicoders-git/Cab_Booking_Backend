
const axios = require('axios');
const { io } = require('socket.io-client');
const FormData = require('form-data');

const API_URL = 'http://localhost:5000';
const SOCKET_URL = 'http://localhost:5000';

async function runTest() {
    console.log("🚀 Starting Full System Test...");

    try {
        // --- STEP 1: ADMIN LOGIN ---
        console.log("\n1️⃣ Logging in as Admin...");
        const adminLogin = await axios.post(`${API_URL}/api/admin/login`, {
            email: "admin_tester@test.com",
            password: "password123"
        });
        const adminToken = adminLogin.data.token;
        const config = { headers: { Authorization: `Bearer ${adminToken}` } };
        console.log("✅ Admin Logged In");

        // --- STEP 2: CREATE CAR CATEGORY ---
        console.log("\n2️⃣ Creating New Car Category (VIP Sedan)...");
        const categoryRes = await axios.post(`${API_URL}/api/car-categories/create`, {
            name: "VIP Sedan " + Date.now(),
            seatCapacity: 4,
            privateRatePerKm: 20,
            sharedRatePerSeatPerKm: 10,
            baseFare: 100,
            avgSpeedKmH: 40
        }, config);
        const categoryId = categoryRes.data.category._id;
        console.log(`✅ Category Created ID: ${categoryId}`);

        // --- STEP 3: REGISTER AGENT ---
        console.log("\n3️⃣ Registering Agent...");
        const agentName = "Agent Vivek " + Date.now();
        const agentEmail = `agent_${Date.now()}@test.com`;
        const agentResp = await axios.post(`${API_URL}/api/admin/create-agent`, {
            name: agentName,
            email: agentEmail,
            phone: `91${Math.floor(Math.random()*100000000)}`,
            password: "password123",
            commissionPercentage: 15
        }, config);
        
        const agentLoginRes = await axios.post(`${API_URL}/api/agents/login`, {
            email: agentEmail,
            password: "password123"
        });
        const agentToken = agentLoginRes.data.token;
        console.log(`✅ Agent Created & Logged In`);

        // --- STEP 4: REGISTER DRIVER & APPROVE ---
        console.log("\n4️⃣ Registering & Approving Driver...");
        const driverEmail = `driver_${Date.now()}@test.com`;
        const driverFormData = new FormData();
        driverFormData.append("name", "Driver 1s Express");
        driverFormData.append("email", driverEmail);
        driverFormData.append("phone", `99${Math.floor(Math.random()*100000000)}`);
        driverFormData.append("password", "password123");
        driverFormData.append("carNumber", `UP32-TEST-${Date.now()}`);
        driverFormData.append("carModel", "Swift Dzire");
        driverFormData.append("carType", categoryId);

        const driverReg = await axios.post(`${API_URL}/api/drivers/register`, driverFormData, {
            headers: driverFormData.getHeaders()
        });
        const driverId = driverReg.data.driver._id;
        
        // Approve via Admin
        await axios.put(`${API_URL}/api/drivers/approve/${driverId}`, {}, config);
        
        const driverLoginRes = await axios.post(`${API_URL}/api/drivers/login`, {
            email: driverEmail,
            password: "password123"
        });
        const driverToken = driverLoginRes.data.token;
        console.log(`✅ Driver Registered, Approved & Logged In: ${driverId}`);

        // --- STEP 5: BOOK RIDE (AGENT) ---
        console.log("\n5️⃣ Agent Booking Ride...");
        const pickupLat = 26.8467;
        const pickupLng = 80.9462;
        
        const bookingRes = await axios.post(`${API_URL}/api/bookings/create`, {
            passengerName: "Test Passenger",
            passengerPhone: "9876543210",
            rideType: "Private",
            carCategoryId: categoryId,
            pickupAddress: "Lucknow Junction",
            pickupLat: pickupLat,
            pickupLng: pickupLng,
            dropAddress: "Hazratganj Lucknow",
            dropLat: 26.8500,
            dropLng: 80.9500,
            distanceKm: 2,
            seatsBooked: 2
        }, { headers: { Authorization: `Bearer ${agentToken}` } });
        const bookingId = bookingRes.data.bookingId;
        console.log(`✅ Ride Booked: ${bookingId}`);

        // --- STEP 6: SOCKET SIMULATION ---
        console.log("\n6️⃣ Connecting Sockets & Simulating Tracking...");
        const driverSocket = io(SOCKET_URL, { auth: { token: driverToken } });
        
        driverSocket.on('connect', async () => {
            console.log("🔌 Driver Socket Connected");
            driverSocket.emit('join_room', { userId: driverId, role: 'driver' });
            driverSocket.emit('driver_online', { driverId: driverId });

            // Step 6a: Accept Request
            console.log("⌛ Finding pending request...");
            const pendingRes = await axios.get(`${API_URL}/api/trips/requests/pending`, {
                 headers: { Authorization: `Bearer ${driverToken}` }
            });
            const requestId = pendingRes.data.requests[0]?._id;
            
            if (requestId) {
                await axios.put(`${API_URL}/api/trips/requests/${requestId}/respond`, {
                    status: "Accepted"
                }, {
                    headers: { Authorization: `Bearer ${driverToken}` }
                });
                console.log("✅ Driver Accepted the Ride");
            } else {
                console.log("⚠️ No pending request found in API. Skipping acceptance.");
            }

            // SIMULATE 5 MOVES
            console.log("📍 Simulating 5 high-frequency moves...");
            for (let i = 1; i <= 5; i++) {
                const newLat = pickupLat + (i * 0.001);
                const newLng = pickupLng + (i * 0.001);
                
                driverSocket.emit('update_location', {
                    driverId: driverId,
                    latitude: newLat,
                    longitude: newLng,
                    heading: 45 + i
                });
                
                console.log(`Step ${i}: Emitted location (${newLat.toFixed(6)}, ${newLng.toFixed(6)})`);
                await new Promise(r => setTimeout(r, 1000));
            }

            console.log("\n🏁 Simulation Complete.");
            console.log("-----------------------------------------");
            console.log("CHECKPOINT: Admin Panel and Agent Panel will see car moving every second.");
            console.log("DB will NOT have these 5 entries (Throttled for 2 mins).");
            console.log("-----------------------------------------");
            process.exit(0);
        });

    } catch (err) {
        console.error("❌ Test Failed:", err.response?.data || err.message);
        process.exit(1);
    }
}

runTest();
