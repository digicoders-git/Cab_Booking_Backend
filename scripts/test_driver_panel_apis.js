const baseURL = "http://localhost:5000/api";

const salt = Math.floor(Math.random() * 100000);
const driverEmail = `driver_${salt}@test.com`;
const driverPhone = `98765${Math.floor(10000 + Math.random() * 90000)}`;
const driverPassword = "password123";

const adminEmail = `admin_approve_${salt}@test.com`;
const adminPassword = "password123";

async function runDriverApis() {
    console.log("=========================================");
    console.log("   AUTOMATED DRIVER PANEL API TESTING    ");
    console.log("=========================================\n");

    let driverId = "";
    let adminToken = "";
    let driverToken = "";

    try {
        // 1. Register Driver
        console.log(`[1] Registering New Driver: ${driverEmail}`);
        const regRes = await fetch(`${baseURL}/drivers/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Test Driver",
                email: driverEmail,
                phone: driverPhone,
                password: driverPassword,
                licenseNumber: `DL-${salt}`
            })
        });
        const regData = await regRes.json();
        if (regData.success) {
            driverId = regData.driver._id;
            console.log("✅ Driver Registered Successfully. ID:", driverId);
        } else {
            console.log("❌ Driver Registration Failed:", regData);
            return;
        }

        // 2. Register Admin
        console.log(`\n[2] Registering Admin for Approval: ${adminEmail}`);
        await fetch(`${baseURL}/admin/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: "Approve Admin", email: adminEmail, password: adminPassword })
        });

        // 3. Login Admin
        console.log(`\n[3] Logging in Admin to get Token`);
        const adminLoginRes = await fetch(`${baseURL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: adminEmail, password: adminPassword })
        });
        const adminLoginData = await adminLoginRes.json();
        if (adminLoginData.success) {
            adminToken = adminLoginData.token;
            console.log("✅ Admin Login Successful");
        } else {
            console.log("❌ Admin Login Failed:", adminLoginData);
            return;
        }

        // 4. Approve Driver
        console.log(`\n[4] Admin Approving Driver ${driverId}`);
        const approveRes = await fetch(`${baseURL}/drivers/approve/${driverId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            }
        });
        const approveData = await approveRes.json();
        if (approveData.success) {
            console.log("✅ Driver Approved Successfully");
        } else {
            console.log("❌ Driver Approval Failed:", approveData);
            return;
        }

        // 5. Login Driver
        console.log(`\n[5] Logging in Driver: ${driverEmail}`);
        const loginRes = await fetch(`${baseURL}/drivers/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: driverEmail, password: driverPassword })
        });
        const loginData = await loginRes.json();
        if (loginData.success) {
            driverToken = loginData.token;
            console.log("✅ Driver Login Successful. Received Token.");
        } else {
            console.log("❌ Driver Login Failed:", loginData);
            return;
        }

        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${driverToken}`
        };

        // 6. Get Profile
        console.log("\n[6] Fetching Driver Profile...");
        const profRes = await fetch(`${baseURL}/drivers/profile`, { headers: authHeaders });
        const profData = await profRes.json();
        console.log(profData.success ? "✅ Profile Fetched" : "❌ Profile Fetch Failed");

        // 7. Update Profile
        console.log("\n[7] Updating Driver Profile (Adding Car Number)...");
        const updateProfRes = await fetch(`${baseURL}/drivers/profile-update`, {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ carNumber: `TEST-CAR-${salt}` })
        });
        const updateProfData = await updateProfRes.json();
        console.log(updateProfData.success ? "✅ Profile Updated" : "❌ Profile Update Failed");

        // 8. Toggle Online Status
        console.log("\n[8] Toggling Online Status + First Location...");
        const toggleRes = await fetch(`${baseURL}/drivers/toggle-online`, {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ latitude: 28.52, longitude: 77.06 })
        });
        const toggleData = await toggleRes.json();
        console.log(toggleData.success ? `✅ Toggled Online: ${toggleData.isOnline}` : "❌ Toggle Failed");

        // 9. Update Live Location
        console.log("\n[9] Sending Live Location Update...");
        const locRes = await fetch(`${baseURL}/drivers/update-location`, {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ latitude: 28.53, longitude: 77.07 })
        });
        const locData = await locRes.json();
        console.log(locData.success ? "✅ Location Updated" : "❌ Location Update Failed");

        // 10. Get Pending Ride Requests
        console.log("\n[10] Checking Pending Ride Requests...");
        const pendingRes = await fetch(`${baseURL}/trips/requests/pending`, { headers: authHeaders });
        const pendingData = await pendingRes.json();
        console.log(pendingRes.ok ? "✅ Fetched Pending Requests" : "❌ Fetch Pending Requests Failed");

        // 11. Get My Trips
        console.log("\n[11] Checking My Trip History...");
        const tripsRes = await fetch(`${baseURL}/trips/driver/my-trips`, { headers: authHeaders });
        const tripsData = await tripsRes.json();
        console.log(tripsRes.ok ? "✅ Fetched My Trips" : "❌ Fetch My Trips Failed");

        // 12. Create Support Ticket
        console.log("\n[12] Creating Support Ticket...");
        const supportRes = await fetch(`${baseURL}/support/create`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ subject: "Testing Driver Panel", description: "Created via automated script" })
        });
        const supportData = await supportRes.json();
        console.log(supportData.success ? "✅ Support Ticket Created" : "❌ Support Ticket Creation Failed");

        // 13. Get My Tickets
        console.log("\n[13] Fetching My Support Tickets...");
        const getSupRes = await fetch(`${baseURL}/support/my-tickets`, { headers: authHeaders });
        const getSupData = await getSupRes.json();
        console.log(getSupData.success ? "✅ Support Tickets Fetched" : "❌ Fetch Support Tickets Failed");

        // 14. Get Wallet Balance
        console.log("\n[14] Checking Wallet Balance...");
        const walletRes = await fetch(`${baseURL}/wallet/my-wallet`, { headers: authHeaders });
        const walletData = await walletRes.json();
        console.log(walletData.success ? "✅ Wallet Balance Fetched" : "❌ Fetch Wallet Failed");

        // 15. Notifications
        console.log("\n[15] Checking Notifications...");
        const notifRes = await fetch(`${baseURL}/notifications/my-notifications`, { headers: authHeaders });
        const notifData = await notifRes.json();
        console.log(notifRes.ok ? "✅ Notifications Fetched" : "❌ Fetch Notifications Failed");

        console.log("\n=========================================");
        console.log("   AUTOMATED DRIVER PANEL TEST COMPLETE   ");
        console.log("=========================================\n");
        
    } catch (error) {
        console.log("❌ Test script crashed:", error.message);
    }
}

runDriverApis();
