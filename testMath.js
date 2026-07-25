function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function calculateHeading(lat1, lon1, lat2, lon2) {
    const dLon = deg2rad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(deg2rad(lat2));
    const x = Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) -
        Math.sin(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.cos(dLon);
    let brng = Math.atan2(y, x);
    brng = brng * (180 / Math.PI);
    brng = (brng + 360) % 360;
    return brng;
}

function isHeadingSimilar(heading1, heading2, maxTolerance = 45) {
    if (heading1 === null || heading2 === null) return true;
    let diff = Math.abs(heading1 - heading2);
    if (diff > 180) diff = 360 - diff;
    return diff <= maxTolerance;
}

const driverLat = 26.904743;
const driverLng = 80.949521;

const homeLat = 26.9841027;
const homeLng = 80.9219763;

const dropLat = 26.8322933;
const dropLng = 80.9214337;

const headingToHome = calculateHeading(driverLat, driverLng, homeLat, homeLng);
const headingToDrop = calculateHeading(driverLat, driverLng, dropLat, dropLng);

console.log(`Heading to Home: ${headingToHome}`);
console.log(`Heading to Drop: ${headingToDrop}`);
console.log(`Are they similar? ${isHeadingSimilar(headingToHome, headingToDrop, 60)}`);
