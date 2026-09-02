exports.generateNormalBookingReceipt = (booking, res) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            doc.pipe(res);

            const logoPath = 'C:\\Users\\vivekvkraj\\OneDrive\\Desktop\\Cab booking\\Carbookig_Website\\Cab_Booking_Website\\src\\assets\\logo.png';
            let hasLogo = fs.existsSync(logoPath);

            doc.lineWidth(1);
            doc.rect(mm(5), mm(5), mm(200), mm(287)).stroke();

            if (hasLogo) {
                doc.save();
                doc.opacity(0.05);
                doc.image(logoPath, mm(45), mm(110), { width: mm(120), height: mm(120) });
                doc.restore();
            }

            doc.moveTo(mm(5), mm(15)).lineTo(mm(205), mm(15)).stroke();
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("Registration Number : 09LUGPK1138L2Z4", mm(10), mm(11), { baseline: 'bottom' });
            doc.text("TAX INVOICE", mm(175), mm(11), { baseline: 'bottom' });

            if (hasLogo) {
                doc.image(logoPath, mm(92.5), mm(18), { width: mm(25), height: mm(25) });
            }
            
            doc.fontSize(22).font('Helvetica-Bold');
            doc.text("KWIK CABS", 0, mm(52), { align: "center", width: mm(210) });
            doc.fontSize(8).font('Helvetica');
            doc.text("Arun Bhawan Kalu Kuwan Baberu Road, Banda UP", 0, mm(59), { align: "center", width: mm(210) });
            doc.text("MOB : +91 7310221010", 0, mm(63), { align: "center", width: mm(210) });

            doc.moveTo(mm(5), mm(72)).lineTo(mm(205), mm(72)).stroke();
            doc.moveTo(mm(125), mm(72)).lineTo(mm(125), mm(125)).stroke();

            doc.font('Helvetica-Bold').fontSize(10);
            doc.text("PASSENGER DETAILS", mm(15), mm(78));
            doc.moveTo(mm(15), mm(82)).lineTo(mm(120), mm(82)).stroke();

            const userName = booking.user?.name || booking.name || 'Valued Customer';
            const userPhone = booking.user?.phone || booking.phone || 'N/A';
            const userEmail = booking.user?.email || 'N/A';
            const pickupAddr = (booking.pickupLocation?.address || booking.pickup?.address || 'N/A').slice(0, 55) + '...';
            const dropAddr = (booking.dropLocation?.address || booking.drop?.address || 'N/A').slice(0, 55) + '...';

            doc.fontSize(9);
            doc.font('Helvetica-Bold').text("Name :", mm(10), mm(88));
            doc.font('Helvetica').text(userName, mm(25), mm(88));
            doc.font('Helvetica-Bold').text("Phone :", mm(10), mm(96));
            doc.font('Helvetica').text(userPhone, mm(25), mm(96));
            doc.font('Helvetica-Bold').text("Email :", mm(10), mm(104));
            doc.font('Helvetica').text(userEmail, mm(25), mm(104));
            doc.font('Helvetica-Bold').text("Pickup :", mm(10), mm(112));
            doc.font('Helvetica').text(pickupAddr, mm(25), mm(112));
            doc.font('Helvetica-Bold').text("Drop :", mm(10), mm(120));
            doc.font('Helvetica').text(dropAddr, mm(25), mm(120));

            doc.font('Helvetica-Bold');
            doc.text(`Invoice No. : TX/${booking._id.toString().slice(-3).toUpperCase()}`, mm(130), mm(80));
            doc.text(`Date : ${new Date().toLocaleDateString('en-GB')}`, mm(130), mm(88));
            doc.text(`Trip Type : ${booking.rideType || booking.tripType || 'One-Way'}`, mm(130), mm(96));
            doc.text(`Vehicle : ${booking.carCategory?.name || 'Cab'}`, mm(130), mm(104));

            const tableTop = 125;
            doc.moveTo(mm(5), mm(tableTop)).lineTo(mm(205), mm(tableTop)).stroke();
            doc.moveTo(mm(5), mm(tableTop + 10)).lineTo(mm(205), mm(tableTop + 10)).stroke();

            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("S. NO.", mm(8), mm(tableTop + 4));
            doc.text("Description", mm(50), mm(tableTop + 4));
            doc.text("Total", mm(188), mm(tableTop + 4));

            const totalFare = booking.actualFare && booking.actualFare > 0 ? booking.actualFare : (booking.fareEstimate || booking.fare || 0);
            
            const baseFare = totalFare / 1.05;
            const cgst = baseFare * 0.025;
            const sgst = baseFare * 0.025;

            let currentY = tableTop + 13.5;
            
            doc.font('Helvetica');
            doc.text(`1`, mm(11), mm(currentY));
            doc.text(`Cab Ride (${pickupAddr.slice(0,15)} to ${dropAddr.slice(0,15)}) - Base Fare`, mm(20), mm(currentY));
            doc.text(`${baseFare.toFixed(2)}`, mm(187), mm(currentY));
            currentY += 10;
            
            doc.text(`2`, mm(11), mm(currentY));
            doc.text(`CGST (2.5%)`, mm(20), mm(currentY));
            doc.text(`${cgst.toFixed(2)}`, mm(187), mm(currentY));
            currentY += 10;

            doc.text(`3`, mm(11), mm(currentY));
            doc.text(`SGST (2.5%)`, mm(20), mm(currentY));
            doc.text(`${sgst.toFixed(2)}`, mm(187), mm(currentY));

            const tableBottom = 165;
            for (let i = tableTop + 20; i < tableBottom; i += 10) {
                doc.moveTo(mm(5), mm(i)).lineTo(mm(205), mm(i)).stroke();
            }
            doc.moveTo(mm(5), mm(tableBottom)).lineTo(mm(205), mm(tableBottom)).stroke();

            doc.moveTo(mm(18), mm(tableTop)).lineTo(mm(18), mm(tableBottom)).stroke();
            doc.moveTo(mm(185), mm(tableTop)).lineTo(mm(185), mm(tableBottom)).stroke();

            doc.font('Helvetica-Bold');
            doc.text("TOTAL PRICE WITH GST", mm(130), mm(tableBottom + 5));
            doc.text(totalFare.toFixed(2), mm(187), mm(tableBottom + 5));
            doc.moveTo(mm(125), mm(tableBottom + 10)).lineTo(mm(205), mm(tableBottom + 10)).stroke();

            doc.fontSize(8);
            doc.text("Total Amount : RUPEES " + totalFare.toFixed(2) + " ONLY", mm(10), mm(tableBottom + 20));
            doc.text("Payment Status: " + (booking.paymentStatus || 'Pending'), mm(10), mm(tableBottom + 25));

            doc.font('Helvetica-Bold');
            doc.text("For KWIK CABS", mm(150), mm(tableBottom + 40));
            doc.moveTo(mm(140), mm(tableBottom + 65)).lineTo(mm(200), mm(tableBottom + 65)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(tableBottom + 68));

            doc.end();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};
