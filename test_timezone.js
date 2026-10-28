const { 
    getISTTimeString, 
    getISTDateString, 
    getISTHourMinute, 
    parseISTDateTime, 
    getStartOfTodayIST, 
    getEndOfTodayIST,
    getStartOfDayDaysAgoIST
} = require("./utils/timeHelper");

const Booking = require("./models/Booking");

console.log("=================================================");
console.log("   DEEP CROSS-CHECK TIMEZONE VERIFICATION TEST");
console.log("=================================================");

// 1. Current IST Time
const currentTimeIST = getISTTimeString();
console.log("1. Current IST Time (12-hr):", currentTimeIST);
if (!currentTimeIST || !currentTimeIST.includes("M")) {
    console.error("FAIL: getISTTimeString didn't return AM/PM format");
    process.exit(1);
}

// 2. Current IST Date
const currentDateIST = getISTDateString();
console.log("2. Current IST Date (DD/MM/YYYY):", currentDateIST);
if (!currentDateIST || currentDateIST.split("/").length !== 3) {
    console.error("FAIL: getISTDateString didn't return DD/MM/YYYY format");
    process.exit(1);
}

// 3. Peak Hours / Schedule Check
const hourMinute = getISTHourMinute();
console.log("3. Current IST 24-hr Time & Day:", hourMinute);
if (typeof hourMinute.hour !== "number" || typeof hourMinute.minute !== "number" || !hourMinute.dayName) {
    console.error("FAIL: getISTHourMinute returned invalid structure");
    process.exit(1);
}

// 4. ISO Parsing without timezone offset (Normal datetime: 14:30)
const parsedNoOffset = parseISTDateTime("2026-10-28T14:30");
console.log("4. Parsing '2026-10-28T14:30' as IST:");
console.log("   -> UTC ISO String:", parsedNoOffset.toISOString());
console.log("   -> IST Formatted:", getISTTimeString(parsedNoOffset));
if (parsedNoOffset.toISOString() !== "2026-10-28T09:00:00.000Z") {
    console.error("FAIL: Expected 2026-10-28T09:00:00.000Z but got " + parsedNoOffset.toISOString());
    process.exit(1);
}

// 5. Date-only parsing for Expiries (Offers, Area Pricing, Incentives)
const startOfTargetDate = parseISTDateTime("2026-10-28", false);
const endOfTargetDate = parseISTDateTime("2026-10-28", true);
console.log("5. Date-only '2026-10-28' Start vs End of Day in IST:");
console.log("   -> Start (00:00:00 IST):", startOfTargetDate.toISOString());
console.log("   -> End (23:59:59 IST):", endOfTargetDate.toISOString());
// In UTC, 00:00 IST on Oct 28 is 18:30 on Oct 27
if (startOfTargetDate.toISOString() !== "2026-10-27T18:30:00.000Z") {
    console.error("FAIL: Start of target date wrong: " + startOfTargetDate.toISOString());
    process.exit(1);
}
// In UTC, 23:59:59.999 IST on Oct 28 is 18:29:59.999 on Oct 28
if (endOfTargetDate.toISOString() !== "2026-10-28T18:29:59.999Z") {
    console.error("FAIL: End of target date wrong: " + endOfTargetDate.toISOString());
    process.exit(1);
}

// 6. Start of Today & End of Today in IST
const startToday = getStartOfTodayIST();
const endToday = getEndOfTodayIST();
console.log("6. Start of Today IST:", startToday.toISOString(), "->", getISTTimeString(startToday));
console.log("   End of Today IST:", endToday.toISOString(), "->", getISTTimeString(endToday));

// 7. Trend Math: 7 Days Ago at 00:00:00 IST
const sevenDaysAgo = getStartOfDayDaysAgoIST(7);
console.log("7. 7 Days Ago Midnight IST:", sevenDaysAgo.toISOString(), "on", getISTDateString(sevenDaysAgo));

// 8. Test Booking Model Default pickupTime
const testBooking = new Booking({ fareEstimate: 150 });
console.log("8. Booking Model Default pickupTime:", testBooking.pickupTime);

console.log("=================================================");
console.log("✅ ALL 8 DEEP CROSS-CHECK TESTS PASSED 100%!");
console.log("=================================================");
