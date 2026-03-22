const baseURL = "http://localhost:5000/api/admin";

const salt = Math.floor(Math.random() * 100000);
const adminEmail = `superadmin_${salt}@test.com`;
const adminPassword = "password123";

async function testAdminFlow() {
    console.log("=========================================");
    console.log("       STARTING ADMIN FLOW TEST          ");
    console.log("=========================================\n");

    let token = "";

    // 1. Register Admin
    try {
        console.log(`[1] Registering new admin via JSON: ${adminEmail}`);
        
        const regRes = await fetch(`${baseURL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Super Admin",
                email: adminEmail,
                password: adminPassword
            })
        });
        
        let regData;
        try { regData = await regRes.json(); } catch(e) { regData = await regRes.text(); }
        
        if (regRes.ok || (regData && regData.success)) {
            console.log("✅ Register Response: SUCCESS");
        } else {
            console.log("❌ Register Failed:", regData);
        }
    } catch (e) {
        console.log("❌ Register Exception:", e.message);
    }

    // 2. Login Admin
    try {
        console.log(`\n[2] Logging in with ${adminEmail}`);
        const loginRes = await fetch(`${baseURL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: adminEmail, password: adminPassword })
        });
        const loginData = await loginRes.json();
        
        if (loginData.success && loginData.token) {
            token = loginData.token;
            console.log("✅ Login Response: SUCCESS. JWT Token Received.");
        } else {
            console.log("❌ Login Failed:", loginData);
            console.log("STOPPING TESTS due to login failure.");
            return;
        }
    } catch (e) {
        console.log("❌ Login Exception:", e.message);
        return;
    }

    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // 3. Get Admin Profile
    try {
        console.log("\n[3] Fetching Admin Profile (/api/admin/profile)");
        const profRes = await fetch(`${baseURL}/profile`, { headers: authHeaders });
        const profData = await profRes.json();
        
        if (profData.success) {
            console.log(`✅ Profile Fetched -> Name: ${profData.admin.name}, Email: ${profData.admin.email}`);
        } else {
            console.log("❌ Profile Fetch Failed:", profData);
        }
    } catch (e) {
        console.log("❌ Profile Exception:", e.message);
    }

    // 4. Get Dashboard Stats
    try {
        console.log("\n[4] Fetching Admin Dashboard Stats (/api/admin/dashboard-stats)");
        const dashRes = await fetch(`${baseURL}/dashboard-stats`, { headers: authHeaders });
        const dashData = await dashRes.json();
        
        if (dashData.success) {
            console.log("✅ Dashboard Stats Fetched Successfully!");
            console.log(`   - Total Users: ${dashData.stats.counts.users}`);
            console.log(`   - Total Drivers: ${dashData.stats.counts.drivers.total} (Approved: ${dashData.stats.counts.drivers.approved})`);
            console.log(`   - Total Agents: ${dashData.stats.counts.agents}`);
            console.log(`   - Total Bookings: ${dashData.stats.counts.bookings.total}`);
            console.log(`   - Admin Total Earnings: ₹${dashData.stats.earnings.totalEarnings}`);
            console.log(`   - Admin Wallet Balance: ₹${dashData.stats.earnings.adminWallet}`);
        } else {
            console.log("❌ Dashboard Stats Failed:", dashData);
        }
    } catch (e) {
        console.log("❌ Dashboard Stats Exception:", e.message);
    }

    // 5. Get Full System Report
    try {
        console.log("\n[5] Fetching Full System Report (/api/admin/full-report)");
        const reportRes = await fetch(`${baseURL}/full-report`, { headers: authHeaders });
        const reportData = await reportRes.json();
        
        if (reportData.success) {
            console.log("✅ Full Report Fetched Successfully!");
            console.log(`   - Total Revenue (Completed Rides): ₹${reportData.report.overview.totalRevenue}`);
            console.log(`   - Cancellation Rate: ${reportData.report.overview.cancellationRate}`);
            console.log(`   - Total Agent Commissions Paid: ₹${reportData.report.financials.totalAgentCommissions}`);
            console.log(`   - New Users (Last 30 Days): ${reportData.report.growth.newUsersLast30Days}`);
            console.log(`   - New Drivers (Last 30 Days): ${reportData.report.growth.newDriversLast30Days}`);
        } else {
            console.log("❌ Full Report Failed:", reportData);
        }
    } catch (e) {
        console.log("❌ Full Report Exception:", e.message);
    }

    console.log("\n=========================================");
    console.log("       ADMIN FLOW TEST COMPLETE          ");
    console.log("=========================================\n");
}

testAdminFlow();
