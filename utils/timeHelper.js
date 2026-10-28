/**
 * Indian Standard Time (IST - Asia/Kolkata) Helper Utility
 * Ensures 100% time & date accuracy across AWS, GCP, VPS, Linux, Windows & Cloud servers.
 */

const TIMEZONE = "Asia/Kolkata";

/**
 * Returns formatted 12-hour time string in IST (e.g., "06:30 PM")
 */
function getISTTimeString(date = new Date()) {
    try {
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleTimeString("en-US", {
            timeZone: TIMEZONE,
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    } catch (err) {
        return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    }
}

/**
 * Formats any time string (e.g. "14:30" or "9:00" or Date) into standard "hh:mm AM/PM"
 */
function formatTo12Hr(t) {
    if (!t) return getISTTimeString();
    if (t instanceof Date) return getISTTimeString(t);
    const str = String(t).trim();
    if (/AM|PM/i.test(str)) return str;
    const parts = str.split(':');
    if (parts.length >= 2) {
        const hour = parseInt(parts[0], 10);
        const minute = parts[1].slice(0, 2);
        if (!isNaN(hour)) {
            const period = hour >= 12 ? 'PM' : 'AM';
            const h12 = hour % 12 || 12;
            return `${h12.toString().padStart(2, '0')}:${minute.padStart(2, '0')} ${period}`;
        }
    }
    return str;
}

/**
 * Returns formatted date string in IST (DD/MM/YYYY)
 */
function getISTDateString(date = new Date()) {
    try {
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleDateString("en-GB", { timeZone: TIMEZONE });
    } catch (err) {
        return new Date().toLocaleDateString("en-GB");
    }
}

/**
 * Returns IST 24-hr hour, minute, and "HH:mm" string for peak hours / schedule checking
 */
function getISTHourMinute(date = new Date()) {
    try {
        const d = date instanceof Date ? date : new Date(date);
        // Formatter in 24-hour mode
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: TIMEZONE,
            hour: "2-digit",
            minute: "2-digit",
            weekday: "long",
            hourCycle: "h23"
        }).formatToParts(d);

        const hour = parts.find(p => p.type === "hour")?.value || "00";
        const minute = parts.find(p => p.type === "minute")?.value || "00";
        const dayName = parts.find(p => p.type === "weekday")?.value || "Sunday";

        return {
            hour: parseInt(hour, 10),
            minute: parseInt(minute, 10),
            timeStr: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
            dayName
        };
    } catch (err) {
        const now = new Date();
        const hour = now.getHours().toString().padStart(2, '0');
        const minute = now.getMinutes().toString().padStart(2, '0');
        return {
            hour: now.getHours(),
            minute: now.getMinutes(),
            timeStr: `${hour}:${minute}`,
            dayName: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()]
        };
    }
}

/**
 * Parses user input (like "2026-10-28T14:30" or "2026-10-28") into a Date object
 * guaranteeing IST interpretation (+05:30) even on UTC servers.
 */
function parseISTDateTime(input, isEndOfDay = false) {
    if (!input) return new Date();
    if (input instanceof Date) return input;

    let str = String(input).trim();

    // 1. Date only: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return new Date(`${str}T${isEndOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`);
    }

    // 2. Already has UTC Z indicator
    if (/Z$/i.test(str)) {
        return new Date(str);
    }

    // 3. Already has explicit timezone offset (+05:30, -04:00, etc.) after time
    if (/(?:T|\s)\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?[+-]\d{2}(?::?\d{2})?$/i.test(str)) {
        return new Date(str);
    }

    // Replace space with T
    str = str.replace(" ", "T");

    // 4. Format is YYYY-MM-DDTHH:mm
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) {
        return new Date(`${str}:${isEndOfDay ? '59.999' : '00'}+05:30`);
    }

    // 5. Format is YYYY-MM-DDTHH:mm:ss
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(str)) {
        return new Date(`${str}+05:30`);
    }

    // Fallback: append +05:30
    return new Date(`${str}+05:30`);
}

function getStartOfDayDaysAgoIST(days = 0) {
    const startOfToday = getStartOfTodayIST();
    startOfToday.setDate(startOfToday.getDate() - days);
    return startOfToday;
}

/**
 * Returns Date object for 00:00:00.000 IST of today (for MongoDB queries like todayBookings)
 */
function getStartOfTodayIST() {
    const now = new Date();
    // Get YYYY-MM-DD in IST
    const istParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(now); // e.g., "2026-10-28"

    return new Date(`${istParts}T00:00:00.000+05:30`);
}

/**
 * Returns Date object for 23:59:59.999 IST of today
 */
function getEndOfTodayIST() {
    const now = new Date();
    const istParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(now);

    return new Date(`${istParts}T23:59:59.999+05:30`);
}

module.exports = {
    TIMEZONE,
    getISTTimeString,
    getISTDateString,
    getISTHourMinute,
    parseISTDateTime,
    getStartOfTodayIST,
    getEndOfTodayIST,
    getStartOfDayDaysAgoIST,
    formatTo12Hr
};

