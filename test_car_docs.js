/**
 * Test Script: Car Document Upload - E2E Verification
 * Tests: Normal Driver Register → Fleet Driver Create → Admin Approve Both → Login → Verify DB
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:5000";
const ADMIN_EMAIL = "admin@excom";
const ADMIN_PASS = "706875";
const FLEET_EMAIL = "fleet@example.com";
const FLEET_PASS = "fleet123";

// Create a tiny dummy image file for testing
const DUMMY_IMG = path.join(__dirname, "uploads", "_test_dummy.jpg");
if (!fs.existsSync(DUMMY_IMG)) {
    // 1x1 pixel white JPEG
    const buf = Buffer.from(
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
        "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDB" +
        "gNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI" +
        "yMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQ" +
        "QAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAA" +
        "AAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=",
        "base64"
    );
    fs.writeFileSync(DUMMY_IMG, buf);
}

// ─── Helper: POST JSON ──────────────────────────────────────────────────────
function postJSON(urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const opts = {
            hostname: "localhost", port: 5000, path: urlPath,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
        };
        const req = http.request(opts, res => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

// ─── Helper: PUT JSON ───────────────────────────────────────────────────────
function putJSON(urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const opts = {
            hostname: "localhost", port: 5000, path: urlPath,
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
        };
        const req = http.request(opts, res => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

// ─── Helper: POST multipart/form-data with files ────────────────────────────
function postFormData(urlPath, fields, files, token) {
    return new Promise((resolve, reject) => {
        const boundary = "----TestBoundary" + Date.now();
        const parts = [];

        // Text fields
        for (const [k, v] of Object.entries(fields)) {
            parts.push(
                `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
            );
        }

        // File fields
        const fileParts = [];
        for (const [fieldName, filePath] of Object.entries(files)) {
            const fileContent = fs.readFileSync(filePath);
            const fileName = path.basename(filePath);
            fileParts.push(
                Buffer.concat([
                    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`),
                    fileContent,
                    Buffer.from("\r\n")
                ])
            );
        }

        const textBuffer = Buffer.from(parts.join(""));
        const endBuffer  = Buffer.from(`--${boundary}--\r\n`);
        const body = Buffer.concat([textBuffer, ...fileParts, endBuffer]);

        const opts = {
            hostname: "localhost", port: 5000, path: urlPath,
            method: "POST",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "Content-Length": body.length,
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
        };
        const req = http.request(opts, res => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

// ─── Helper: GET ─────────────────────────────────────────────────────────────
function getJSON(urlPath, token) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: "localhost", port: 5000, path: urlPath,
            method: "GET",
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        };
        const req = http.request(opts, res => {
            let raw = "";
            res.on("data", d => raw += d);
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on("error", reject);
        req.end();
    });
}

function log(step, msg, obj) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`STEP ${step}: ${msg}`);
    if (obj) console.log(JSON.stringify(obj, null, 2));
}

// ─── MAIN TEST ───────────────────────────────────────────────────────────────
(async () => {
    try {
        // Unique emails to avoid duplicate errors
        const ts = Date.now();
        const NORMAL_DRIVER_EMAIL = `driver_normal_${ts}@test.com`;
        const FLEET_DRIVER_EMAIL  = `driver_fleet_${ts}@test.com`;

        // ── STEP 1: Admin Login ─────────────────────────────────────────────
        log(1, "Admin Login");
        const adminLogin = await postJSON("/api/admin/login", { email: ADMIN_EMAIL, password: ADMIN_PASS });
        console.log("Status:", adminLogin.status);
        const adminToken = adminLogin.body.token;
        if (!adminToken) { console.log("❌ Admin login failed!"); process.exit(1); }
        console.log("✅ Admin Token milgaya!");

        // ── STEP 2: Fleet Login ─────────────────────────────────────────────
        log(2, "Fleet Login");
        const fleetLogin = await postJSON("/api/fleet/login", { email: FLEET_EMAIL, password: FLEET_PASS });
        console.log("Status:", fleetLogin.status);
        const fleetToken = fleetLogin.body.token;
        if (!fleetToken) { console.log("❌ Fleet login failed!"); process.exit(1); }
        console.log("✅ Fleet Token milgaya!");

        // ── STEP 3: Normal Driver Register WITH car documents ───────────────
        log(3, `Normal Driver Register with car documents (${NORMAL_DRIVER_EMAIL})`);
        const normalReg = await postFormData(
            "/api/drivers/register",
            {
                name: "Normal Driver Test",
                email: NORMAL_DRIVER_EMAIL,
                phone: `98765${ts.toString().slice(-5)}`,
                password: "pass123",
                licenseNumber: "DL1234567890",
                carNumber: `MH12${ts.toString().slice(-4)}`,
                carModel: "Swift",
                carBrand: "Maruti",
                carColor: "Red"
            },
            {
                image:         DUMMY_IMG,
                rcImage:       DUMMY_IMG,
                insuranceImage: DUMMY_IMG,
                permitImage:   DUMMY_IMG,
                pucImage:      DUMMY_IMG
            }
        );
        console.log("Status:", normalReg.status);
        const normalDriverId = normalReg.body.driver?._id;
        const normalCarDocs  = normalReg.body.driver?.carDetails?.carDocuments;
        console.log("✅ Normal Driver ID:", normalDriverId);
        console.log("📄 carDocuments saved:", JSON.stringify(normalCarDocs, null, 2));

        // ── STEP 4: Fleet creates a Driver WITH car documents ───────────────
        log(4, `Fleet creates Driver with car documents (${FLEET_DRIVER_EMAIL})`);
        const fleetDriverReg = await postFormData(
            "/api/drivers/register",
            {
                name: "Fleet Driver Test",
                email: FLEET_DRIVER_EMAIL,
                phone: `91234${ts.toString().slice(-5)}`,
                password: "pass123",
                licenseNumber: "DL9876543210",
                carNumber: `DL34${ts.toString().slice(-4)}`,
                carModel: "Innova",
                carBrand: "Toyota",
                carColor: "White"
            },
            {
                image:         DUMMY_IMG,
                rcImage:       DUMMY_IMG,
                insuranceImage: DUMMY_IMG,
                permitImage:   DUMMY_IMG,
                pucImage:      DUMMY_IMG
            },
            fleetToken  // sent by fleet (token)
        );
        console.log("Status:", fleetDriverReg.status);
        const fleetDriverId = fleetDriverReg.body.driver?._id;
        const fleetCarDocs  = fleetDriverReg.body.driver?.carDetails?.carDocuments;
        console.log("✅ Fleet Driver ID:", fleetDriverId);
        console.log("📄 carDocuments saved:", JSON.stringify(fleetCarDocs, null, 2));

        // ── STEP 5: Admin Approves Normal Driver ────────────────────────────
        log(5, "Admin approves Normal Driver");
        const approveNormal = await putJSON(`/api/drivers/approve/${normalDriverId}`, {}, adminToken);
        console.log("Status:", approveNormal.status);
        console.log(approveNormal.body.message || approveNormal.body);

        // ── STEP 6: Admin Approves Fleet Driver ─────────────────────────────
        log(6, "Admin approves Fleet Driver");
        const approveFleet = await putJSON(`/api/drivers/approve/${fleetDriverId}`, {}, adminToken);
        console.log("Status:", approveFleet.status);
        console.log(approveFleet.body.message || approveFleet.body);

        // ── STEP 7: Normal Driver Login ─────────────────────────────────────
        log(7, "Normal Driver Login");
        const normalLogin = await postJSON("/api/drivers/login", { email: NORMAL_DRIVER_EMAIL, password: "pass123" });
        console.log("Status:", normalLogin.status);
        const normalToken = normalLogin.body.token;
        console.log("✅ Normal Driver logged in!");

        // ── STEP 8: Get Normal Driver Profile (verify car docs in DB) ───────
        log(8, "Get Normal Driver Profile — Verify carDocuments in DB");
        const normalProfile = await getJSON("/api/drivers/profile", normalToken);
        const nd = normalProfile.body.driver;
        console.log("Driver Name:", nd?.name);
        console.log("Car Number:", nd?.carDetails?.carNumber);
        console.log("\n📄 carDetails.carDocuments from DB:");
        console.log("  rc        :", nd?.carDetails?.carDocuments?.rc        || "❌ NOT SAVED");
        console.log("  insurance :", nd?.carDetails?.carDocuments?.insurance || "❌ NOT SAVED");
        console.log("  permit    :", nd?.carDetails?.carDocuments?.permit    || "❌ NOT SAVED");
        console.log("  puc       :", nd?.carDetails?.carDocuments?.puc       || "❌ NOT SAVED");

        // ── STEP 9: Fleet Driver Login ──────────────────────────────────────
        log(9, "Fleet Driver Login");
        const fleetDLogin = await postJSON("/api/drivers/login", { email: FLEET_DRIVER_EMAIL, password: "pass123" });
        console.log("Status:", fleetDLogin.status);
        const fleetDToken = fleetDLogin.body.token;
        console.log("✅ Fleet Driver logged in!");

        // ── STEP 10: Get Fleet Driver Profile (verify car docs) ─────────────
        log(10, "Get Fleet Driver Profile — Verify carDocuments in DB");
        const fleetProfile = await getJSON("/api/drivers/profile", fleetDToken);
        const fd = fleetProfile.body.driver;
        console.log("Driver Name:", fd?.name);
        console.log("Car Number:", fd?.carDetails?.carNumber);
        console.log("\n📄 carDetails.carDocuments from DB:");
        console.log("  rc        :", fd?.carDetails?.carDocuments?.rc        || "❌ NOT SAVED");
        console.log("  insurance :", fd?.carDetails?.carDocuments?.insurance || "❌ NOT SAVED");
        console.log("  permit    :", fd?.carDetails?.carDocuments?.permit    || "❌ NOT SAVED");
        console.log("  puc       :", fd?.carDetails?.carDocuments?.puc       || "❌ NOT SAVED");

        // ── FINAL SUMMARY ───────────────────────────────────────────────────
        console.log("\n" + "=".repeat(60));
        console.log("✅✅✅  TEST COMPLETE  ✅✅✅");
        const allDocsOk = [
            nd?.carDetails?.carDocuments?.rc,
            nd?.carDetails?.carDocuments?.insurance,
            fd?.carDetails?.carDocuments?.rc,
            fd?.carDetails?.carDocuments?.insurance
        ].every(Boolean);
        console.log(allDocsOk
            ? "🎉 PASS: Dono drivers ke carDocuments DB mein save ho gaye!"
            : "⚠️  PARTIAL: Kuch documents save nahi hue, upar check karo."
        );

    } catch (err) {
        console.error("❌ Test failed:", err.message);
        process.exit(1);
    }
})();
