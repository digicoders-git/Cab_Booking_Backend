const fs = require('fs');
const file = 'c:/Users/vivekvkraj/OneDrive/Desktop/Cab booking/CapBokkin/utils/pdfGenerator.js';
let content = fs.readFileSync(file, 'utf8');

const addUserPdfStr = `
exports.generateUserReportPdf = (userData, res) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: mm(10) });
            doc.pipe(res);

            const logoPath = path.join(__dirname, '..', 'assets', 'logo2.png');
            let hasLogo = fs.existsSync(logoPath);

            // Border
            doc.lineWidth(1);
            doc.rect(mm(5), mm(5), mm(200), mm(287)).stroke();

            // Watermark and Logo
            if (hasLogo) {
                doc.save();
                doc.opacity(0.05);
                doc.image(logoPath, mm(45), mm(110), { width: mm(120), height: mm(120) });
                doc.restore();
                doc.image(logoPath, mm(92.5), mm(10), { width: mm(25), height: mm(25) });
            }
            
            // Header
            doc.fontSize(22).font('Helvetica-Bold');
            doc.text("KWIK CABS - USER REPORT", 0, mm(40), { align: "center", width: mm(210) });

            doc.moveTo(mm(5), mm(52)).lineTo(mm(205), mm(52)).stroke();

            // 1. User Info
            doc.fontSize(14).font('Helvetica-Bold').text("1. User Profile", mm(15), mm(60));
            
            doc.fontSize(10);
            doc.font('Helvetica-Bold').text("User ID:", mm(20), mm(70));
            doc.font('Helvetica').text(userData._id?.toString().toUpperCase() || "N/A", mm(55), mm(70));
            
            doc.font('Helvetica-Bold').text("Name:", mm(20), mm(77));
            doc.font('Helvetica').text(userData.name || "N/A", mm(55), mm(77));
            
            doc.font('Helvetica-Bold').text("Phone:", mm(20), mm(84));
            doc.font('Helvetica').text(userData.phone || "N/A", mm(55), mm(84));
            
            doc.font('Helvetica-Bold').text("Email:", mm(20), mm(91));
            doc.font('Helvetica').text(userData.email || "N/A", mm(55), mm(91));
            
            doc.font('Helvetica-Bold').text("Joined On:", mm(20), mm(98));
            doc.font('Helvetica').text(userData.stats?.joinedDate ? new Date(userData.stats.joinedDate).toLocaleDateString('en-GB') : "N/A", mm(55), mm(98));

            // 2. Activity Overview
            doc.fontSize(14).font('Helvetica-Bold').text("2. Activity Overview", mm(15), mm(115));
            doc.fontSize(10);
            doc.font('Helvetica-Bold').text("Total Rides:", mm(20), mm(125));
            doc.font('Helvetica').text(userData.stats?.totalRides || 0, mm(60), mm(125));

            doc.font('Helvetica-Bold').text("Completed Rides:", mm(20), mm(132));
            doc.font('Helvetica').text(userData.stats?.completedRides || 0, mm(60), mm(132));
            
            doc.font('Helvetica-Bold').text("Total Spent:", mm(20), mm(139));
            doc.font('Helvetica').text(\`Rs. \${(userData.stats?.totalSpent || 0).toLocaleString('en-IN')}\`, mm(60), mm(139));

            // 3. Rides Summary
            const rides = userData.rides || [];
            doc.fontSize(14).font('Helvetica-Bold').text("3. Ride History Summary", mm(15), mm(155));

            if (rides.length > 0) {
                const tableTop = 165;
                
                doc.moveTo(mm(15), mm(tableTop)).lineTo(mm(195), mm(tableTop)).stroke();
                doc.moveTo(mm(15), mm(tableTop + 8)).lineTo(mm(195), mm(tableTop + 8)).stroke();

                doc.font('Helvetica-Bold').fontSize(9);
                doc.text("Date", mm(18), mm(tableTop + 3));
                doc.text("Type", mm(40), mm(tableTop + 3));
                doc.text("Pickup City", mm(70), mm(tableTop + 3));
                doc.text("Drop City", mm(120), mm(tableTop + 3));
                doc.text("Fare", mm(170), mm(tableTop + 3));

                let currentY = tableTop + 12;
                doc.font('Helvetica').fontSize(8);
                
                rides.slice(0, 40).forEach((ride, index) => {
                    if(currentY > 260) {
                        doc.addPage();
                        currentY = 20;
                    }
                    const date = ride.date ? new Date(ride.date).toLocaleDateString('en-GB') : "N/A";
                    const type = ride.type || "City Ride";
                    // Extract city from full address to keep it short
                    const pickup = (ride.pickup || "N/A").split(',')[0].substring(0, 25);
                    const drop = (ride.drop || "N/A").split(',')[0].substring(0, 25);
                    const price = ride.fare || 0;

                    doc.text(date, mm(18), mm(currentY));
                    doc.text(type, mm(40), mm(currentY));
                    doc.text(pickup, mm(70), mm(currentY));
                    doc.text(drop, mm(120), mm(currentY));
                    doc.text(\`Rs. \${price.toLocaleString('en-IN')}\`, mm(170), mm(currentY));
                    
                    doc.moveTo(mm(15), mm(currentY + 6)).lineTo(mm(195), mm(currentY + 6)).strokeColor('#eeeeee').stroke();
                    doc.strokeColor('black');

                    currentY += 8;
                });
                
                if(rides.length > 40) {
                    doc.text(\`... and \${rides.length - 40} more rides.\`, mm(18), mm(currentY + 5));
                }
            } else {
                doc.font('Helvetica').fontSize(10).text("No ride history available for this user.", mm(20), mm(170));
            }

            // Footer / Signatory
            doc.addPage();
            doc.font('Helvetica-Bold').fontSize(10);
            doc.text("For KWIK CABS", mm(145), mm(265));
            doc.moveTo(mm(140), mm(278)).lineTo(mm(200), mm(278)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(282));

            doc.end();
            resolve(true);
        } catch (error) {
            console.error("PDF Gen Error:", error);
            reject(error);
        }
    });
};
`;

content += addUserPdfStr;
fs.writeFileSync(file, content);
console.log('Added generateUserReportPdf successfully!');
