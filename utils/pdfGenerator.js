const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper to convert millimeters to points (PDFKit uses 72 points per inch)
const mm = (val) => val * 2.83465;

const signaturePath = path.join(__dirname, '../assets/signature.png');
const hasSignature = fs.existsSync(signaturePath);

exports.generateBulkBookingReceipt = (booking, res) => {
    return new Promise((resolve, reject) => {
        try {
            // A4 size is [210mm, 297mm]
            const doc = new PDFDocument({ size: 'A4', margin: 0 });

            doc.pipe(res);

            // Path to logo (from backend assets)
            const logoPath = path.join(__dirname, '..', 'assets', 'logo2.png');
            let hasLogo = fs.existsSync(logoPath);

            // 1. External Border
            doc.lineWidth(1);
            doc.rect(mm(5), mm(5), mm(200), mm(287)).stroke();

            // 🛡️ WATERMARK (LOGO)
            if (hasLogo) {
                doc.save();
                doc.opacity(0.05);
                doc.image(logoPath, mm(45), mm(110), { width: mm(120), height: mm(120) });
                doc.restore();
            }

            // 2. Top Header Section (PAN & TAX INVOICE)
            doc.moveTo(mm(5), mm(15)).lineTo(mm(205), mm(15)).stroke();
            
            doc.font('Helvetica-Bold').fontSize(9);
            // Baseline top helps align text properly like jsPDF
            doc.text("Registration Number : 09LUGPK1138L2Z4", mm(10), mm(11), { baseline: 'bottom' });
            doc.text("TAX INVOICE", mm(175), mm(11), { baseline: 'bottom' });

            // 3. Company Branding
            if (hasLogo) {
                // Centered at mm(105)
                doc.image(logoPath, mm(92.5), mm(18), { width: mm(25), height: mm(25) });
            }
            
            doc.fontSize(22).font('Helvetica-Bold');
            doc.text("KWIK CABS", 0, mm(52), { align: "center", width: mm(210) });
            
            doc.fontSize(8).font('Helvetica');
            doc.text("Arun Bhawan Kalu Kuwan Baberu Road, Banda UP", 0, mm(59), { align: "center", width: mm(210) });
            doc.text("MOB : +91 7310221010", 0, mm(63), { align: "center", width: mm(210) });

            // 4. Details Section (Receiver & Invoice Info)
            doc.moveTo(mm(5), mm(72)).lineTo(mm(205), mm(72)).stroke();
            doc.moveTo(mm(125), mm(72)).lineTo(mm(125), mm(125)).stroke();

            doc.font('Helvetica-Bold').fontSize(10);
            doc.text("DETAIL OF RECEIVER / CONSIGNEE", mm(15), mm(78));
            // Underline
            doc.moveTo(mm(15), mm(82)).lineTo(mm(75), mm(82)).stroke();

            const userName = booking.customerName || booking.createdBy?.name || 'Valued Customer';
            const userPhone = booking.customerPhone || booking.createdBy?.phone || 'N/A';
            const userEmail = booking.createdBy?.email || 'N/A';
            const pickupAddr = (booking.pickup?.address || '').slice(0, 55) + '...';
            const dropAddr = (booking.drop?.address || '').slice(0, 55) + '...';

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

            // Invoice Info (Right side)
            doc.font('Helvetica-Bold');
            doc.text(`Invoice No. : PT/${booking._id.toString().slice(-3).toUpperCase()}`, mm(130), mm(80));
            doc.text(`Invoice Date : ${new Date().toLocaleDateString('en-GB')}`, mm(130), mm(88));
            doc.text(`Pickup Date : ${new Date(booking.pickupDateTime).toLocaleDateString('en-GB')}`, mm(130), mm(96));

            if (booking.tripType === 'RoundTrip' && booking.returnDateTime) {
                doc.text(`Return Date : ${new Date(booking.returnDateTime).toLocaleDateString('en-GB')}`, mm(130), mm(104));
            } else {
                doc.text(`Duration : ${booking.numberOfDays || 1} Day(s)`, mm(130), mm(104));
            }
            doc.text(`Trip Mode : ${booking.tripType || 'OneWay'}`, mm(130), mm(112));

            // 5. Table Header
            const tableTop = 125;
            doc.moveTo(mm(5), mm(tableTop)).lineTo(mm(205), mm(tableTop)).stroke();
            doc.moveTo(mm(5), mm(tableTop + 10)).lineTo(mm(205), mm(tableTop + 10)).stroke();

            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("S. NO.", mm(8), mm(tableTop + 4));
            doc.text("Description", mm(50), mm(tableTop + 4));
            doc.text("Qty.", mm(148), mm(tableTop + 4));
            doc.text("Rate", mm(168), mm(tableTop + 4));
            doc.text("Total", mm(188), mm(tableTop + 4));

            // 6. Table Body
            // Start text at tableTop + 13.5 to vertically center it in the 10mm row box
            let currentY = tableTop + 13.5;
            
            const offeredPrice = booking.offeredPrice || 0;
            const carsReq = booking.carsRequired || [];

            const totalBaseWeight = carsReq.reduce((sum, item) => {
                return sum + ((item.category?.bulkBookingBasePrice || 0) * item.quantity);
            }, 0);

            if (carsReq.length > 0) {
                carsReq.forEach((item, index) => {
                    doc.font('Helvetica');
                    doc.text(`${index + 1}`, mm(11), mm(currentY));
                    doc.text(`Bulk Booking - ${item.category?.name || 'Vehicle'} (${booking.tripType})`, mm(20), mm(currentY));
                    doc.text(`${item.quantity}`, mm(150), mm(currentY));

                    let totalForCategory = 0;
                    if (totalBaseWeight > 0) {
                        const weight = (item.category?.bulkBookingBasePrice || 0) * item.quantity;
                        totalForCategory = Math.round((weight / totalBaseWeight) * offeredPrice);
                    } else {
                        totalForCategory = Math.round(offeredPrice / carsReq.length);
                    }

                    const rate = Math.round(totalForCategory / item.quantity);

                    doc.text(`${rate.toLocaleString()}`, mm(167), mm(currentY));
                    doc.font('Helvetica-Bold').text(`${totalForCategory.toLocaleString()}`, mm(187), mm(currentY));

                    currentY += 10;
                });
            }

            // Draw uniform grid lines
            const tableBottom = 205;
            for (let i = tableTop + 20; i < tableBottom; i += 10) {
                doc.moveTo(mm(5), mm(i)).lineTo(mm(205), mm(i)).stroke();
            }
            doc.moveTo(mm(5), mm(tableBottom)).lineTo(mm(205), mm(tableBottom)).stroke();

            // Vertical lines for table - PERFECT ALIGNMENT
            doc.moveTo(mm(18), mm(tableTop)).lineTo(mm(18), mm(tableBottom)).stroke();
            doc.moveTo(mm(145), mm(tableTop)).lineTo(mm(145), mm(tableBottom)).stroke();
            doc.moveTo(mm(165), mm(tableTop)).lineTo(mm(165), mm(tableBottom)).stroke();
            doc.moveTo(mm(185), mm(tableTop)).lineTo(mm(185), mm(tableBottom)).stroke();

            // 7. Totals Section
            doc.font('Helvetica-Bold');
            const advancePaid = booking.advancePayment?.amount || 0;
            const mcdTax = booking.mcdStateTaxApplied || 0;
            
            // Base fare already includes mcdTax in bulkBookingController (offeredPrice = offeredPrice + totalTaxForBooking)
            // Wait, does offeredPrice include it? Let me check bulkBookingController.js:
            // "offeredPrice = Number(offeredPrice) + totalTaxForBooking;" -> Yes, it includes it!
            // But to show it separately, we subtract it from base fare for display
            
            const baseFareWithoutMcd = offeredPrice - mcdTax;
            const cgst = Math.round(offeredPrice * 0.025);
            const sgst = Math.round(offeredPrice * 0.025);
            const totalPriceWithTax = offeredPrice + cgst + sgst;
            let remainingBalance = totalPriceWithTax - advancePaid;
            
            const isCompleted = booking.status === 'Completed' || booking.finalPayment?.isPaid;

            doc.text("BASE FARE", mm(130), mm(tableBottom + 5));
            doc.text(`${baseFareWithoutMcd.toLocaleString()}`, mm(180), mm(tableBottom + 5));
            
            doc.text("MCD / STATE TAX", mm(130), mm(tableBottom + 10));
            doc.text(`+ ${mcdTax.toLocaleString()}`, mm(180), mm(tableBottom + 10));
            
            doc.text("CGST (2.5%)", mm(130), mm(tableBottom + 15));
            doc.text(`+ ${cgst.toLocaleString()}`, mm(180), mm(tableBottom + 15));
            
            doc.text("SGST (2.5%)", mm(130), mm(tableBottom + 20));
            doc.text(`+ ${sgst.toLocaleString()}`, mm(180), mm(tableBottom + 20));
            
            doc.moveTo(mm(80), mm(tableBottom + 23)).lineTo(mm(205), mm(tableBottom + 23)).stroke();

            doc.text("TOTAL PRICE WITH GST", mm(130), mm(tableBottom + 27));
            doc.text(`${totalPriceWithTax.toLocaleString()}`, mm(180), mm(tableBottom + 27));
            doc.moveTo(mm(80), mm(tableBottom + 31)).lineTo(mm(205), mm(tableBottom + 31)).stroke();

            doc.text("ADVANCE PAID", mm(130), mm(tableBottom + 32));
            doc.text(`${advancePaid.toLocaleString()}`, mm(180), mm(tableBottom + 32));
            doc.moveTo(mm(80), mm(tableBottom + 36)).lineTo(mm(205), mm(tableBottom + 36)).stroke();

            doc.rect(mm(80), mm(tableBottom + 36), mm(125), mm(10)).fill('#E6E6E6');
            doc.fill('#000000'); // Reset text color
            
            if (isCompleted) {
                doc.text("FINAL PAYMENT PAID", mm(130), mm(tableBottom + 40));
                doc.text(`INR ${remainingBalance.toLocaleString()}`, mm(180), mm(tableBottom + 40));
            } else {
                doc.text("REMAINING BALANCE", mm(130), mm(tableBottom + 40));
                doc.text(`INR ${remainingBalance.toLocaleString()}`, mm(180), mm(tableBottom + 40));
            }
            doc.moveTo(mm(80), mm(tableBottom + 46)).lineTo(mm(205), mm(tableBottom + 46)).stroke();

            // 8. Bottom Footer
            doc.fontSize(8);
            doc.text(`Total Amount (in words) : RUPEES ${totalPriceWithTax.toLocaleString()} ONLY`, mm(10), mm(tableBottom + 48));
            
            if (isCompleted) {
                doc.text(`Note: Full payment of INR ${totalPriceWithTax.toLocaleString()} has been settled.`, mm(10), mm(tableBottom + 52));
            } else {
                doc.text(`Note: Balance of INR ${remainingBalance.toLocaleString()} to be paid directly to the fleet owner.`, mm(10), mm(tableBottom + 52));
            }

            doc.font('Helvetica-Bold');
            if (hasSignature) {
                doc.image(signaturePath, mm(145), mm(tableBottom + 55), { width: mm(40) });
            }
            doc.moveTo(mm(140), mm(tableBottom + 75)).lineTo(mm(200), mm(tableBottom + 75)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(tableBottom + 78));

            doc.end();
            resolve();
            
        } catch (error) {
            reject(error);
        }
    });
};

exports.generateDriverBulkPayoutReceipt = (booking, driverId, res) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            doc.pipe(res);

            const logoPath = path.join(__dirname, '..', 'assets', 'logo2.png');
            let hasLogo = fs.existsSync(logoPath);

            const signaturePath = path.join(__dirname, '..', 'assets', 'signature.png');
            const hasSignature = fs.existsSync(signaturePath);

            const mm = (val) => val * 2.83465; // Helper to convert mm to points

            // Draw outer border
            doc.rect(mm(5), mm(5), mm(200), mm(287)).stroke();

            // 1. Header Box
            doc.moveTo(mm(5), mm(15)).lineTo(mm(205), mm(15)).stroke();
            doc.font('Helvetica-Bold').fontSize(8);
            doc.text("DRIVER PAYOUT RECEIPT", mm(150), mm(8));

            // 2. Company Logo & Info
            if (hasLogo) {
                doc.image(logoPath, mm(95), mm(18), { width: mm(20) });
            }
            const yAfterLogo = hasLogo ? 42 : 25;
            doc.fontSize(16).text("KWIK CABS", mm(10), mm(yAfterLogo), { align: 'center', width: mm(190) });
            doc.font('Helvetica').fontSize(8);
            doc.text("Arun Bhawan Kalu Kuwan Baberu Road, Banda UP", mm(10), mm(yAfterLogo + 6), { align: 'center', width: mm(190) });
            doc.text("MOB : +91 7310221010", mm(10), mm(yAfterLogo + 10), { align: 'center', width: mm(190) });

            doc.moveTo(mm(5), mm(yAfterLogo + 16)).lineTo(mm(205), mm(yAfterLogo + 16)).stroke();

            // Find Driver Info
            const assignment = booking.assignedDrivers.find(d => d.driver?._id?.toString() === driverId.toString() || d.driver?.toString() === driverId.toString());
            const driverName = assignment?.driver?.name || "Driver Partner";
            const driverPhone = assignment?.driver?.phone || "N/A";
            
            // Wait, the caller needs to pass the driver object or populate it
            // Assuming it's populated!

            // 3. Driver & Ride Info
            doc.font('Helvetica-Bold').fontSize(9).text("DETAIL OF DRIVER PARTNER", mm(10), mm(yAfterLogo + 20));
            doc.font('Helvetica').fontSize(8);
            
            doc.font('Helvetica-Bold').text("Name :", mm(10), mm(yAfterLogo + 28));
            doc.font('Helvetica').text(driverName, mm(25), mm(yAfterLogo + 28));
            
            doc.font('Helvetica-Bold').text("Phone :", mm(10), mm(yAfterLogo + 34));
            doc.font('Helvetica').text(driverPhone, mm(25), mm(yAfterLogo + 34));

            doc.font('Helvetica-Bold').text("Car Category :", mm(10), mm(yAfterLogo + 40));
            doc.font('Helvetica').text(assignment?.categoryName || "N/A", mm(32), mm(yAfterLogo + 40));

            // Right side info
            doc.moveTo(mm(120), mm(yAfterLogo + 16)).lineTo(mm(120), mm(yAfterLogo + 48)).stroke();

            doc.font('Helvetica-Bold').text("Receipt No. :", mm(125), mm(yAfterLogo + 20));
            doc.font('Helvetica').text(`DP/${booking._id.toString().slice(-6).toUpperCase()}`, mm(150), mm(yAfterLogo + 20));

            doc.font('Helvetica-Bold').text("Date :", mm(125), mm(yAfterLogo + 26));
            doc.font('Helvetica').text(new Date().toLocaleDateString('en-GB'), mm(150), mm(yAfterLogo + 26));

            doc.font('Helvetica-Bold').text("Trip Status :", mm(125), mm(yAfterLogo + 32));
            doc.font('Helvetica').text(assignment?.status || "Unknown", mm(150), mm(yAfterLogo + 32));

            doc.moveTo(mm(5), mm(yAfterLogo + 48)).lineTo(mm(205), mm(yAfterLogo + 48)).stroke();

            // 4. Financial Breakdown Grid
            const tableTop = yAfterLogo + 55;
            
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("PAYOUT BREAKDOWN", mm(10), mm(tableTop - 4));
            
            doc.moveTo(mm(5), mm(tableTop)).lineTo(mm(205), mm(tableTop)).stroke();
            doc.moveTo(mm(5), mm(tableTop + 10)).lineTo(mm(205), mm(tableTop + 10)).stroke();

            doc.text("Description", mm(15), mm(tableTop + 3));
            doc.text("Amount (INR)", mm(160), mm(tableTop + 3));

            let currentY = tableTop + 15;
            doc.font('Helvetica');

            // Gross Share
            doc.text("Gross Trip Earning (Total Bill for this Car)", mm(15), mm(currentY));
            doc.text(`+ ${assignment?.grossShare || 0}`, mm(160), mm(currentY));
            currentY += 10;

            // Commission
            doc.text("Admin Commission Deducted", mm(15), mm(currentY));
            doc.text(`- ${assignment?.commission || 0}`, mm(160), mm(currentY));
            currentY += 10;
            
            // Security Deposit returned/settled
            // We assume it's settled.
            
            doc.moveTo(mm(5), mm(currentY)).lineTo(mm(205), mm(currentY)).stroke();
            currentY += 5;

            // Final Earnings
            doc.font('Helvetica-Bold');
            doc.text("NET PAYOUT EARNINGS", mm(15), mm(currentY));
            doc.text(`${assignment?.payoutAmount || 0}`, mm(160), mm(currentY));
            currentY += 10;
            
            doc.moveTo(mm(5), mm(currentY)).lineTo(mm(205), mm(currentY)).stroke();

            // 5. Bottom Footer
            doc.fontSize(8);
            if (assignment?.payoutSettled) {
                doc.text(`Note: Payout of INR ${assignment?.payoutAmount || 0} has been successfully settled to your wallet.`, mm(10), mm(currentY + 10));
            } else {
                doc.text(`Note: Payout of INR ${assignment?.payoutAmount || 0} is pending settlement.`, mm(10), mm(currentY + 10));
            }

            doc.font('Helvetica-Bold');
            if (hasSignature) {
                doc.image(signaturePath, mm(145), mm(currentY + 20), { width: mm(40) });
            }
            doc.moveTo(mm(140), mm(currentY + 40)).lineTo(mm(200), mm(currentY + 40)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(currentY + 43));

            doc.end();
            resolve();
            
        } catch (error) {
            reject(error);
        }
    });
};

exports.generateSecurityReceipt = (booking, res) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            doc.pipe(res);

            const logoPath = path.join(__dirname, '..', 'assets', 'logo2.png');
            let hasLogo = fs.existsSync(logoPath);

            const signaturePath = path.join(__dirname, '..', 'assets', 'signature.png');
            const hasSignature = fs.existsSync(signaturePath);


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
            const isCompleted = booking.status === 'Completed';
            doc.text(isCompleted ? "FINAL SETTLEMENT RECEIPT" : "SECURITY DEPOSIT RECEIPT", mm(145), mm(11), { baseline: 'bottom' });

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
            doc.text("FLEET OWNER DETAILS (PAYER)", mm(15), mm(78));
            doc.moveTo(mm(15), mm(82)).lineTo(mm(75), mm(82)).stroke();

            const fleetName = booking.assignedFleet?.companyName || booking.assignedFleet?.name || 'Fleet Owner';
            const fleetPhone = booking.assignedFleet?.phone || 'N/A';
            const fleetEmail = booking.assignedFleet?.email || 'N/A';
            
            doc.fontSize(9);
            doc.font('Helvetica-Bold').text("Name :", mm(10), mm(88));
            doc.font('Helvetica').text(fleetName, mm(25), mm(88));

            doc.font('Helvetica-Bold').text("Phone :", mm(10), mm(96));
            doc.font('Helvetica').text(fleetPhone, mm(25), mm(96));

            doc.font('Helvetica-Bold').text("Email :", mm(10), mm(104));
            doc.font('Helvetica').text(fleetEmail, mm(25), mm(104));

            doc.font('Helvetica-Bold').text("Pickup :", mm(10), mm(112));
            doc.font('Helvetica').text((booking.pickup?.address || 'N/A').slice(0, 55) + '...', mm(25), mm(112));

            doc.font('Helvetica-Bold').text("Drop :", mm(10), mm(120));
            doc.font('Helvetica').text((booking.drop?.address || 'N/A').slice(0, 55) + '...', mm(25), mm(120));

            doc.font('Helvetica-Bold');
            doc.text(`Receipt No. : SEC/${booking._id.toString().slice(-3).toUpperCase()}`, mm(130), mm(77));
            doc.text(`Date : ${new Date().toLocaleDateString('en-GB')}`, mm(130), mm(83));
            doc.text(`Pickup Date : ${new Date(booking.pickupDateTime).toLocaleDateString('en-GB')}`, mm(130), mm(89));

            if (booking.tripType === 'RoundTrip' && booking.returnDateTime) {
                doc.text(`Return Date : ${new Date(booking.returnDateTime).toLocaleDateString('en-GB')}`, mm(130), mm(95));
            } else {
                doc.text(`Duration : ${booking.numberOfDays || 1} Day(s)`, mm(130), mm(95));
            }
            doc.text(`Total Deal : INR ${(booking.totalPriceWithTax || booking.offeredPrice)?.toLocaleString()}`, mm(130), mm(101));
            doc.text(`Booking ID : #${booking._id.toString().slice(-8).toUpperCase()}`, mm(130), mm(107));
            
            const customerName = booking.customerName || booking.createdBy?.name || 'Customer';
            doc.text(`Booked By : ${customerName.slice(0, 25)}`, mm(130), mm(113));

            const customerPhone = booking.customerPhone || booking.createdBy?.phone || 'N/A';
            doc.text(`Contact : ${customerPhone}`, mm(130), mm(119));

            const tableTop = 125;
            doc.moveTo(mm(5), mm(tableTop)).lineTo(mm(205), mm(tableTop)).stroke();
            doc.moveTo(mm(5), mm(tableTop + 10)).lineTo(mm(205), mm(tableTop + 10)).stroke();

            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("S. NO.", mm(8), mm(tableTop + 4));
            doc.text("Description", mm(70), mm(tableTop + 4));
            doc.text("Qty.", mm(152), mm(tableTop + 4));
            doc.text("Amount", mm(182), mm(tableTop + 4));

            const tableBottom = 205;
            doc.moveTo(mm(18), mm(tableTop)).lineTo(mm(18), mm(tableBottom)).stroke();
            doc.moveTo(mm(145), mm(tableTop)).lineTo(mm(145), mm(tableBottom)).stroke();
            doc.moveTo(mm(175), mm(tableTop)).lineTo(mm(175), mm(tableBottom)).stroke();

            let currentY = tableTop + 13.5;
            doc.font('Helvetica');
            
            const carsReq = booking.carsRequired || [];
            const carNames = carsReq.map(c => `${c.quantity}x ${c.category?.name || 'Vehicle'}`).join(', ');
            const securityAmount = booking.fleetSecurityPayment?.amount || Math.round((booking.totalPriceWithTax || booking.offeredPrice || 0) * 0.20);
            
            if (isCompleted) {
                doc.text("1", mm(11), mm(currentY));
                doc.text(`Total Deal Value for ${carNames}`, mm(20), mm(currentY));
                doc.text("1", mm(156), mm(currentY));
                doc.font('Helvetica-Bold').text(`${(booking.totalPriceWithTax || booking.offeredPrice || 0).toLocaleString()}`, mm(180), mm(currentY));
                
                currentY += 10;
                doc.font('Helvetica');
                doc.text("2", mm(11), mm(currentY));
                doc.text(`Security Deposit Paid`, mm(20), mm(currentY));
                doc.text("1", mm(156), mm(currentY));
                doc.font('Helvetica-Bold').text(`${securityAmount.toLocaleString()}`, mm(180), mm(currentY));
                
                currentY += 10;
                doc.font('Helvetica');
                const advanceAmount = booking.advancePayment?.amount || 0;
                doc.text("3", mm(11), mm(currentY));
                doc.text(`Advance Paid by Customer (Refunded)`, mm(20), mm(currentY));
                doc.text("1", mm(156), mm(currentY));
                doc.font('Helvetica-Bold').text(`${advanceAmount.toLocaleString()}`, mm(180), mm(currentY));
                
                currentY += 10;
                doc.font('Helvetica');
                const remainingBalance = (booking.totalPriceWithTax || booking.offeredPrice || 0) - advanceAmount;
                const finalAmount = booking.finalPayment?.amount || remainingBalance;
                doc.text("4", mm(11), mm(currentY));
                doc.text(`Final Balance Paid by Customer`, mm(20), mm(currentY));
                doc.text("1", mm(156), mm(currentY));
                doc.font('Helvetica-Bold').text(`${finalAmount.toLocaleString()}`, mm(180), mm(currentY));
                
                const agentComm = booking.agentCommissionAmount || 0;
                if (agentComm > 0) {
                    currentY += 10;
                    doc.font('Helvetica');
                    doc.text("5", mm(11), mm(currentY));
                    doc.text(`Agent Commission Deducted`, mm(20), mm(currentY));
                    doc.text("1", mm(156), mm(currentY));
                    doc.font('Helvetica-Bold').text(`${agentComm.toLocaleString()}`, mm(180), mm(currentY));
                }
            } else {
                doc.text("1", mm(11), mm(currentY));
                const descText = `Security Deposit for ${carNames || 'Bulk Deal'}`;
                doc.text(descText, mm(20), mm(currentY));
                doc.text("1", mm(156), mm(currentY));
                doc.font('Helvetica-Bold').text(`${securityAmount.toLocaleString()}`, mm(180), mm(currentY));
            }

            for (let i = tableTop + 20; i < tableBottom; i += 10) {
                doc.moveTo(mm(5), mm(i)).lineTo(mm(205), mm(i)).stroke();
            }
            doc.moveTo(mm(5), mm(tableBottom)).lineTo(mm(205), mm(tableBottom)).stroke();

            doc.font('Helvetica-Bold');
            if (isCompleted) {
                const securityAmt = Math.round((booking.offeredPrice || 0) * 0.20);
                const totalFleetEarnings = (booking.offeredPrice || 0) - securityAmt - (booking.agentCommissionAmount || 0);
                doc.text("TOTAL NET EARNINGS", mm(120), mm(tableBottom + 10));
                doc.text(`INR ${totalFleetEarnings.toLocaleString()}`, mm(180), mm(tableBottom + 10));
            } else {
                const securityAmt = Math.round((booking.offeredPrice || 0) * 0.20);
                doc.text("TOTAL SECURITY PAID", mm(110), mm(tableBottom + 10));
                doc.text(`INR ${securityAmt.toLocaleString()}`, mm(180), mm(tableBottom + 10));
            }
            doc.moveTo(mm(100), mm(tableBottom + 15)).lineTo(mm(205), mm(tableBottom + 15)).stroke();

            doc.fontSize(8).font('Helvetica');
            if (isCompleted) {
                doc.text(`* Total Earnings = Total Deal - Security Deposit - Agent Commission.`, mm(10), mm(tableBottom + 25));
                doc.text(`* Advance portion was settled by Admin, Final balance collected by Fleet.`, mm(10), mm(tableBottom + 30));
            } else {
                doc.text(`* This amount is non-refundable security deposit for accepting the marketplace deal.`, mm(10), mm(tableBottom + 25));
                doc.text(`* Final settlement will happen after trip completion.`, mm(10), mm(tableBottom + 30));
            }

            doc.font('Helvetica-Bold');
            if (hasSignature) {
                doc.image(signaturePath, mm(145), mm(tableBottom + 55), { width: mm(40) });
            }
            doc.moveTo(mm(140), mm(tableBottom + 75)).lineTo(mm(200), mm(tableBottom + 75)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(tableBottom + 78));

            doc.end();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};

exports.generateAgentLeadReceipt = async (lead, res) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 0
            });

            doc.pipe(res);

            const mm = (val) => val * 2.83465;

            doc.rect(mm(5), mm(5), mm(200), mm(287)).stroke();

            doc.moveTo(mm(5), mm(15)).lineTo(mm(205), mm(15)).stroke();
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("Registration Number : 09LUGPK1138L2Z4", mm(10), mm(11), { baseline: 'bottom' });
            doc.text("AGENT LEAD BOOKING RECEIPT", mm(145), mm(11), { baseline: 'bottom' });

            const logoPath = path.join(__dirname, '..', 'assets', 'logo2.png');
            const hasLogo = fs.existsSync(logoPath);

            if (hasLogo) {
                doc.image(logoPath, mm(92.5), mm(18), { width: mm(25), height: mm(25) });
                
                doc.save();
                doc.opacity(0.05);
                doc.image(logoPath, mm(45), mm(110), { width: mm(120), height: mm(120) });
                doc.restore();
            }

            doc.fontSize(28).font('Helvetica-Bold');
            doc.text("KWIK CABS", 0, mm(48), { align: 'center' });

            doc.fontSize(8).font('Helvetica');
            doc.text("Arun Bhawan Kalu Kuwan Baberu Road, Banda UP", 0, mm(56), { align: 'center' });
            doc.text("MOB : +91 7310221010", 0, mm(60), { align: 'center' });

            doc.moveTo(mm(5), mm(72)).lineTo(mm(205), mm(72)).stroke();
            doc.moveTo(mm(125), mm(72)).lineTo(mm(125), mm(125)).stroke();

            doc.font('Helvetica-Bold').fontSize(10);
            doc.text("DETAIL OF RECEIVER / CONSIGNEE", mm(15), mm(77));
            doc.moveTo(mm(15), mm(81)).lineTo(mm(75), mm(81)).stroke();

            doc.fontSize(9);
            const customerName = lead.customerName || 'Customer';
            const customerPhone = lead.customerPhone || 'N/A';
            const agentName = lead.createdByAgent?.name || 'Agent';

            let currentLeftY = 86;

            doc.font('Helvetica-Bold').text("Customer :", mm(10), mm(currentLeftY));
            doc.font('Helvetica').text(customerName.slice(0, 35), mm(30), mm(currentLeftY));
            currentLeftY += 6;

            doc.font('Helvetica-Bold').text("Phone :", mm(10), mm(currentLeftY));
            doc.font('Helvetica').text(customerPhone, mm(30), mm(currentLeftY));
            currentLeftY += 6;

            doc.font('Helvetica-Bold').text("Booked By :", mm(10), mm(currentLeftY));
            doc.font('Helvetica').text(`Agent ${agentName}`.slice(0, 35), mm(30), mm(currentLeftY));
            currentLeftY += 6;

            const pickupText = lead.pickup?.address || 'N/A';
            doc.font('Helvetica-Bold').text("Pickup :", mm(10), mm(currentLeftY));
            doc.font('Helvetica');
            const pickupHeight = doc.heightOfString(pickupText, { width: mm(90) });
            doc.text(pickupText, mm(30), mm(currentLeftY), { width: mm(90) });
            currentLeftY += (pickupHeight / 2.83465) + 1.5;

            const dropText = lead.drop?.address || 'N/A';
            doc.font('Helvetica-Bold').text("Drop :", mm(10), mm(currentLeftY));
            doc.font('Helvetica');
            const dropHeight = doc.heightOfString(dropText, { width: mm(90) });
            doc.text(dropText, mm(30), mm(currentLeftY), { width: mm(90) });
            currentLeftY += (dropHeight / 2.83465) + 1.5;

            if (lead.assignedDriver) {
                doc.font('Helvetica-Bold').text("Driver :", mm(10), mm(currentLeftY));
                doc.font('Helvetica').text(`${lead.assignedDriver.name} (+91 ${lead.assignedDriver.phone})`, mm(30), mm(currentLeftY));
            }

            doc.font('Helvetica-Bold');
            doc.text(`Receipt No. : LEAD/${lead._id.toString().slice(-3).toUpperCase()}`, mm(130), mm(86));
            doc.text(`Date : ${new Date().toLocaleDateString('en-GB')}`, mm(130), mm(92));
            doc.text(`Pickup Date : ${new Date(lead.pickupDateTime).toLocaleDateString('en-GB')}`, mm(130), mm(98));
            doc.text(`Vehicle : ${lead.carCategory?.name || 'Cab'}`, mm(130), mm(104));
            doc.text(`Lead Status : ${lead.status}`, mm(130), mm(110));
            doc.text(`Booking ID : #${lead._id.toString().slice(-8).toUpperCase()}`, mm(130), mm(116));

            const tableTop = 125;
            doc.moveTo(mm(5), mm(tableTop)).lineTo(mm(205), mm(tableTop)).stroke();
            doc.moveTo(mm(5), mm(tableTop + 10)).lineTo(mm(205), mm(tableTop + 10)).stroke();

            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("S. NO.", mm(8), mm(tableTop + 4));
            doc.text("Description", mm(70), mm(tableTop + 4));
            doc.text("Qty.", mm(152), mm(tableTop + 4));
            doc.text("Amount", mm(182), mm(tableTop + 4));

            const tableBottom = 205;
            doc.moveTo(mm(18), mm(tableTop)).lineTo(mm(18), mm(tableBottom)).stroke();
            doc.moveTo(mm(145), mm(tableTop)).lineTo(mm(145), mm(tableBottom)).stroke();
            doc.moveTo(mm(175), mm(tableTop)).lineTo(mm(175), mm(tableBottom)).stroke();

            let currentY = tableTop + 13.5;
            doc.font('Helvetica');
            doc.text("1", mm(11), mm(currentY));
            
            const catName = lead.carCategory?.name || 'Cab';
            doc.text(`Booking Fare for ${catName}`, mm(20), mm(currentY));
            doc.text("1", mm(156), mm(currentY));
            doc.font('Helvetica-Bold').text(`${(lead.totalPrice || 0).toLocaleString()}`, mm(180), mm(currentY));

            for (let i = tableTop + 20; i < tableBottom; i += 10) {
                doc.moveTo(mm(5), mm(i)).lineTo(mm(205), mm(i)).stroke();
            }
            doc.moveTo(mm(5), mm(tableBottom)).lineTo(mm(205), mm(tableBottom)).stroke();

            doc.font('Helvetica-Bold');
            doc.text("TOTAL ESTIMATED FARE", mm(120), mm(tableBottom + 10));
            doc.text(`INR ${(lead.totalPrice || 0).toLocaleString()}`, mm(180), mm(tableBottom + 10));
            
            doc.moveTo(mm(100), mm(tableBottom + 15)).lineTo(mm(205), mm(tableBottom + 15)).stroke();

            // ADVANCE PAID (COMMISSION)
            doc.text("ADVANCE PAID (COMMISSION)", mm(120), mm(tableBottom + 18));
            doc.text(`INR ${(lead.agentCommission || 0).toLocaleString()}`, mm(180), mm(tableBottom + 18));

            doc.moveTo(mm(100), mm(tableBottom + 23)).lineTo(mm(205), mm(tableBottom + 23)).stroke();

            // BALANCE TO COLLECT
            doc.text("BALANCE / NET AMOUNT", mm(120), mm(tableBottom + 26));
            doc.text(`INR ${(lead.driverEarning || 0).toLocaleString()}`, mm(180), mm(tableBottom + 26));

            doc.moveTo(mm(100), mm(tableBottom + 31)).lineTo(mm(205), mm(tableBottom + 31)).stroke();

            doc.fontSize(8).font('Helvetica');
            doc.text(`* This is an estimated fare. Tolls and parking charges are extra and to be paid directly to driver.`, mm(10), mm(tableBottom + 40));
            doc.text(`* Balance Amount to be paid in cash directly to the driver during the trip.`, mm(10), mm(tableBottom + 45));

            doc.font('Helvetica-Bold');
            if (hasSignature) {
                doc.image(signaturePath, mm(145), mm(tableBottom + 50), { width: mm(40) });
            }
            doc.moveTo(mm(140), mm(tableBottom + 70)).lineTo(mm(200), mm(tableBottom + 70)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(tableBottom + 73));

            doc.end();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};

exports.generateDriverCommissionReceipt = async (lead, res) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            doc.pipe(res);
            const mm = (val) => val * 2.83465;

            doc.rect(mm(5), mm(5), mm(200), mm(287)).stroke();
            doc.moveTo(mm(5), mm(15)).lineTo(mm(205), mm(15)).stroke();
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("Registration Number : 09LUGPK1138L2Z4", mm(10), mm(11), { baseline: 'bottom' });
            doc.text("DRIVER COMMISSION INVOICE", mm(145), mm(11), { baseline: 'bottom' });

            const logoPath = path.join(__dirname, '..', 'assets', 'logo2.png');
            const hasLogo = fs.existsSync(logoPath);

            if (hasLogo) {
                doc.image(logoPath, mm(92.5), mm(18), { width: mm(25), height: mm(25) });
                doc.save();
                doc.opacity(0.05);
                doc.image(logoPath, mm(45), mm(110), { width: mm(120), height: mm(120) });
                doc.restore();
            }

            doc.fontSize(28).font('Helvetica-Bold');
            doc.text("KWIK CABS", 0, mm(48), { align: 'center' });

            doc.fontSize(8).font('Helvetica');
            doc.text("Arun Bhawan Kalu Kuwan Baberu Road, Banda UP", 0, mm(56), { align: 'center' });
            doc.text("MOB : +91 7310221010", 0, mm(60), { align: 'center' });

            doc.moveTo(mm(5), mm(72)).lineTo(mm(205), mm(72)).stroke();
            doc.moveTo(mm(125), mm(72)).lineTo(mm(125), mm(125)).stroke();

            doc.font('Helvetica-Bold').fontSize(10);
            doc.text("BILLED TO / DRIVER", mm(15), mm(77));
            doc.moveTo(mm(15), mm(81)).lineTo(mm(75), mm(81)).stroke();

            doc.fontSize(9);
            const driverName = lead.assignedDriver?.name || 'Driver';
            const driverPhone = lead.assignedDriver?.phone || 'N/A';

            let currentLeftY = 86;

            doc.font('Helvetica-Bold').text("Driver Name :", mm(10), mm(currentLeftY));
            doc.font('Helvetica').text(driverName, mm(33), mm(currentLeftY));
            currentLeftY += 6;

            doc.font('Helvetica-Bold').text("Phone :", mm(10), mm(currentLeftY));
            doc.font('Helvetica').text(`+91 ${driverPhone}`, mm(33), mm(currentLeftY));
            currentLeftY += 8;

            const pickupText = lead.pickup?.address || 'N/A';
            doc.font('Helvetica-Bold').text("Pickup :", mm(10), mm(currentLeftY));
            doc.font('Helvetica');
            const pickupHeight = doc.heightOfString(pickupText, { width: mm(85) });
            doc.text(pickupText, mm(33), mm(currentLeftY), { width: mm(85) });
            currentLeftY += (pickupHeight / 2.83465) + 1.5;

            const dropText = lead.drop?.address || 'N/A';
            doc.font('Helvetica-Bold').text("Drop :", mm(10), mm(currentLeftY));
            doc.font('Helvetica');
            const dropHeight = doc.heightOfString(dropText, { width: mm(85) });
            doc.text(dropText, mm(33), mm(currentLeftY), { width: mm(85) });
            currentLeftY += (dropHeight / 2.83465) + 1.5;

            doc.font('Helvetica-Bold');
            doc.text(`Invoice No. : COM/${lead._id.toString().slice(-3).toUpperCase()}`, mm(130), mm(86));
            doc.text(`Date : ${new Date().toLocaleDateString('en-GB')}`, mm(130), mm(92));
            doc.text(`Vehicle : ${lead.carCategory?.name || 'Cab'}`, mm(130), mm(98));
            
            let paymentStatusStr = "Paid (In Escrow)";
            if (lead.status === 'Completed' || lead.paymentStatus === 'Settled') {
                paymentStatusStr = "Settled";
            }
            doc.text(`Payment Status : ${paymentStatusStr}`, mm(130), mm(104));
            doc.text(`Transaction ID : ${lead.hdfcTransactionId || lead.hdfcOrderId || 'Online Payment'}`, mm(130), mm(110));
            doc.text(`Booking ID : #${lead._id.toString().slice(-8).toUpperCase()}`, mm(130), mm(116));

            const tableTop = 125;
            doc.moveTo(mm(5), mm(tableTop)).lineTo(mm(205), mm(tableTop)).stroke();
            doc.moveTo(mm(5), mm(tableTop + 10)).lineTo(mm(205), mm(tableTop + 10)).stroke();

            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("S. NO.", mm(8), mm(tableTop + 4));
            doc.text("Description", mm(70), mm(tableTop + 4));
            doc.text("Amount", mm(182), mm(tableTop + 4));

            const tableBottom = 205;
            doc.moveTo(mm(18), mm(tableTop)).lineTo(mm(18), mm(tableBottom)).stroke();
            doc.moveTo(mm(175), mm(tableTop)).lineTo(mm(175), mm(tableBottom)).stroke();

            let currentY = tableTop + 13.5;
            doc.font('Helvetica');
            doc.text("1", mm(11), mm(currentY));
            
            doc.text(`Platform Commission / Unlock Fee`, mm(20), mm(currentY));
            doc.font('Helvetica-Bold').text(`${(lead.agentCommission || 0).toLocaleString()}`, mm(180), mm(currentY));

            for (let i = tableTop + 20; i < tableBottom; i += 10) {
                doc.moveTo(mm(5), mm(i)).lineTo(mm(205), mm(i)).stroke();
            }
            doc.moveTo(mm(5), mm(tableBottom)).lineTo(mm(205), mm(tableBottom)).stroke();

            doc.font('Helvetica-Bold');
            doc.text("TOTAL CASH COLLECTED FROM CUSTOMER", mm(100), mm(tableBottom + 8));
            doc.text(`INR ${(lead.totalPrice || 0).toLocaleString()}`, mm(180), mm(tableBottom + 8));
            
            doc.moveTo(mm(100), mm(tableBottom + 13)).lineTo(mm(205), mm(tableBottom + 13)).stroke();
            
            doc.text("TOTAL COMMISSION PAID TO PLATFORM", mm(100), mm(tableBottom + 18));
            doc.text(`INR ${(lead.agentCommission || 0).toLocaleString()}`, mm(180), mm(tableBottom + 18));

            doc.moveTo(mm(100), mm(tableBottom + 23)).lineTo(mm(205), mm(tableBottom + 23)).stroke();

            doc.text("NET EARNINGS FOR THIS TRIP", mm(100), mm(tableBottom + 28));
            doc.text(`INR ${(lead.driverEarning || 0).toLocaleString()}`, mm(180), mm(tableBottom + 28));

            doc.moveTo(mm(100), mm(tableBottom + 33)).lineTo(mm(205), mm(tableBottom + 33)).stroke();

            doc.fontSize(8).font('Helvetica');
            doc.text(`* This invoice acts as a receipt for the commission paid to Kwik Cabs to unlock the lead.`, mm(10), mm(tableBottom + 40));
            doc.text(`* This is an automated computer-generated receipt and does not require a physical signature.`, mm(10), mm(tableBottom + 45));

            doc.font('Helvetica-Bold');
            if (hasSignature) {
                doc.image(signaturePath, mm(145), mm(tableBottom + 50), { width: mm(40) });
            }
            doc.moveTo(mm(140), mm(tableBottom + 70)).lineTo(mm(200), mm(tableBottom + 70)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(tableBottom + 73));

            doc.end();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};

exports.generateFixedBookingReceipt = (booking, res) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            doc.pipe(res);

            const logoPath = path.join(__dirname, '..', 'assets', 'logo2.png');
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
            doc.text("KWIK CABS", 0, mm(52), { align: 'center', width: mm(210) });
            doc.fontSize(8).font('Helvetica');
            doc.text("Arun Bhawan Kalu Kuwan Baberu Road, Banda UP", 0, mm(59), { align: 'center', width: mm(210) });
            doc.text("MOB : +91 7310221010", 0, mm(63), { align: 'center', width: mm(210) });

            doc.moveTo(mm(5), mm(72)).lineTo(mm(205), mm(72)).stroke();
            doc.moveTo(mm(125), mm(72)).lineTo(mm(125), mm(125)).stroke();

            doc.font('Helvetica-Bold').fontSize(10);
            doc.text("PASSENGER DETAILS", mm(15), mm(78));
            doc.moveTo(mm(15), mm(82)).lineTo(mm(120), mm(82)).stroke();

            const userName = booking.user?.name || 'Valued Customer';
            const userPhone = booking.user?.phone || 'N/A';
            const userEmail = booking.user?.email || 'N/A';
            const pickupAddr = (booking.pickupLocation || 'N/A').slice(0, 55) + '...';
            const dropAddr = (booking.dropLocation || 'N/A').slice(0, 55) + '...';

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
            doc.text("Invoice No. : FX/" + booking._id.toString().slice(-3).toUpperCase(), mm(130), mm(80));
            doc.text("Date : " + new Date().toLocaleDateString('en-GB'), mm(130), mm(88));
            doc.text("Trip Type : " + (booking.tripType || 'Fixed Package'), mm(130), mm(96));
            doc.text("Vehicle : " + (booking.carCategory?.name || 'Cab'), mm(130), mm(104));

            const tableTop = 125;
            doc.moveTo(mm(5), mm(tableTop)).lineTo(mm(205), mm(tableTop)).stroke();
            doc.moveTo(mm(5), mm(tableTop + 10)).lineTo(mm(205), mm(tableTop + 10)).stroke();

            doc.font('Helvetica-Bold').fontSize(9);
            doc.text("S. NO.", mm(8), mm(tableTop + 4));
            doc.text("Description", mm(50), mm(tableTop + 4));
            doc.text("Total", mm(188), mm(tableTop + 4));

            const baseFare = booking.price || 0;
            const cgst = booking.cgst || (baseFare * 0.025);
            const sgst = booking.sgst || (baseFare * 0.025);
            const totalWithTax = booking.finalPrice || (baseFare + cgst + sgst);

            let currentY = tableTop + 13.5;
            let serialNo = 1;
            
            doc.font('Helvetica');
            doc.text(`${serialNo++}`, mm(11), mm(currentY));
            doc.text("Fixed Package (" + pickupAddr.slice(0,15) + " to " + dropAddr.slice(0,15) + ") - Base Fare", mm(20), mm(currentY));
            doc.text(baseFare.toFixed(2), mm(187), mm(currentY));
            currentY += 10;
            
            doc.text(`${serialNo++}`, mm(11), mm(currentY));
            doc.text("Extra Time Charges", mm(20), mm(currentY));
            doc.text((booking.extraTimeCharges || 0).toFixed(2), mm(187), mm(currentY));
            currentY += 10;

            doc.text(`${serialNo++}`, mm(11), mm(currentY));
            doc.text("Extra Distance Charges", mm(20), mm(currentY));
            doc.text((booking.extraDistanceCharges || 0).toFixed(2), mm(187), mm(currentY));
            currentY += 10;

            doc.text(`${serialNo++}`, mm(11), mm(currentY));
            doc.text("CGST (2.5%)", mm(20), mm(currentY));
            doc.text(cgst.toFixed(2), mm(187), mm(currentY));
            currentY += 10;

            doc.text(`${serialNo++}`, mm(11), mm(currentY));
            doc.text("SGST (2.5%)", mm(20), mm(currentY));
            doc.text(sgst.toFixed(2), mm(187), mm(currentY));

            const tableBottom = tableTop + ((serialNo - 1) * 10) + 10;
            for (let i = tableTop + 20; i < tableBottom; i += 10) {
                doc.moveTo(mm(5), mm(i)).lineTo(mm(205), mm(i)).stroke();
            }
            doc.moveTo(mm(5), mm(tableBottom)).lineTo(mm(205), mm(tableBottom)).stroke();

            doc.moveTo(mm(18), mm(tableTop)).lineTo(mm(18), mm(tableBottom)).stroke();
            doc.moveTo(mm(185), mm(tableTop)).lineTo(mm(185), mm(tableBottom)).stroke();

            doc.font('Helvetica-Bold');
            doc.text("TOTAL PRICE WITH GST", mm(130), mm(tableBottom + 5));
            doc.text(totalWithTax.toFixed(2), mm(187), mm(tableBottom + 5));
            doc.moveTo(mm(125), mm(tableBottom + 10)).lineTo(mm(205), mm(tableBottom + 10)).stroke();

            doc.fontSize(8);
            doc.text("Total Amount : RUPEES " + totalWithTax.toFixed(2) + " ONLY", mm(10), mm(tableBottom + 20));
            doc.text("Payment Status: " + (booking.paymentStatus || 'Pending'), mm(10), mm(tableBottom + 25));

            doc.font('Helvetica-Bold');
            if (hasSignature) {
                doc.image(signaturePath, mm(145), mm(tableBottom + 45), { width: mm(40) });
            }
            doc.moveTo(mm(140), mm(tableBottom + 65)).lineTo(mm(200), mm(tableBottom + 65)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(tableBottom + 68));

            doc.end();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};
exports.generateNormalBookingReceipt = (booking, res) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            doc.pipe(res);

            const logoPath = path.join(__dirname, '..', 'assets', 'logo2.png');
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
            if (hasSignature) {
                doc.image(signaturePath, mm(145), mm(tableBottom + 45), { width: mm(40) });
            }
            doc.moveTo(mm(140), mm(tableBottom + 65)).lineTo(mm(200), mm(tableBottom + 65)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(tableBottom + 68));

            doc.end();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};

exports.generateDriverReportPdf = (driverData, res) => {
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
            doc.text("KWIK CABS - DRIVER REPORT", 0, mm(40), { align: "center", width: mm(210) });

            doc.moveTo(mm(5), mm(52)).lineTo(mm(205), mm(52)).stroke();

            // 1. Driver Info
            doc.fontSize(14).font('Helvetica-Bold').text("1. Driver Profile", mm(15), mm(60));
            
            doc.fontSize(10);
            doc.font('Helvetica-Bold').text("Driver ID:", mm(20), mm(70));
            doc.font('Helvetica').text(driverData._id?.toString().toUpperCase() || "N/A", mm(55), mm(70));
            
            doc.font('Helvetica-Bold').text("Name:", mm(20), mm(77));
            doc.font('Helvetica').text(driverData.name || "N/A", mm(55), mm(77));
            
            doc.font('Helvetica-Bold').text("Phone:", mm(20), mm(84));
            doc.font('Helvetica').text(driverData.phone || "N/A", mm(55), mm(84));
            
            doc.font('Helvetica-Bold').text("Email:", mm(20), mm(91));
            doc.font('Helvetica').text(driverData.email || "N/A", mm(55), mm(91));
            
            doc.font('Helvetica-Bold').text("Joined On:", mm(20), mm(98));
            doc.font('Helvetica').text(driverData.createdAt ? new Date(driverData.createdAt).toLocaleDateString('en-GB') : "N/A", mm(55), mm(98));

            // 2. Wallet Info
            doc.fontSize(14).font('Helvetica-Bold').text("2. Financial Overview (Wallet)", mm(15), mm(115));
            doc.fontSize(10);
            doc.font('Helvetica-Bold').text("Wallet Balance:", mm(20), mm(125));
            const balance = driverData.walletBalance || 0;
            doc.font('Helvetica').fillColor(balance < 0 ? 'red' : 'green')
               .text(`Rs. ${balance.toLocaleString('en-IN')}`, mm(60), mm(125));
            doc.fillColor('black');

            doc.font('Helvetica-Bold').text("Total Earnings:", mm(20), mm(132));
            doc.font('Helvetica').text(`Rs. ${(driverData.totalEarnings || 0).toLocaleString('en-IN')}`, mm(60), mm(132));

            // 3. Rides Summary
            const rides = driverData.rides || [];
            doc.fontSize(14).font('Helvetica-Bold').text("3. Ride History Summary", mm(15), mm(150));
            doc.fontSize(10).font('Helvetica-Bold').text(`Total Completed Rides: ${rides.length}`, mm(20), mm(160));

            if (rides.length > 0) {
                const tableTop = 175;
                
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
                
                rides.slice(0, 30).forEach((ride, index) => {
                    if(currentY > 260) {
                        doc.addPage();
                        currentY = 20;
                    }
                    const date = ride.pickupDateTime ? new Date(ride.pickupDateTime).toLocaleDateString('en-GB') : "N/A";
                    const type = ride.tripType || "OneWay";
                    // Extract city from full address to keep it short
                    const pickup = (ride.pickup?.address || "N/A").split(',')[0].substring(0, 25);
                    const drop = (ride.drop?.address || "N/A").split(',')[0].substring(0, 25);
                    const price = ride.offeredPrice || ride.price || 0;

                    doc.text(date, mm(18), mm(currentY));
                    doc.text(type, mm(40), mm(currentY));
                    doc.text(pickup, mm(70), mm(currentY));
                    doc.text(drop, mm(120), mm(currentY));
                    doc.text(`Rs. ${price.toLocaleString('en-IN')}`, mm(170), mm(currentY));
                    
                    doc.moveTo(mm(15), mm(currentY + 6)).lineTo(mm(195), mm(currentY + 6)).strokeColor('#eeeeee').stroke();
                    doc.strokeColor('black');

                    currentY += 8;
                });
                
                if(rides.length > 30) {
                    doc.text(`... and ${rides.length - 30} more rides.`, mm(18), mm(currentY + 5));
                }
            } else {
                doc.font('Helvetica').fontSize(10).text("No ride history available for this driver.", mm(20), mm(175));
            }

                        // 4. Wallet Transactions
            const transactions = driverData.transactions || [];
            let currentYForTxn = 20;
            doc.addPage();
            doc.fontSize(14).font('Helvetica-Bold').text("4. Wallet Transactions (Lifetime)", mm(15), mm(currentYForTxn));
            doc.fontSize(10).font('Helvetica-Bold').text(`Total Credits: Rs. ${(driverData.totalCredits || 0).toLocaleString('en-IN')} | Total Debits: Rs. ${(driverData.totalDebits || 0).toLocaleString('en-IN')}`, mm(20), mm(currentYForTxn + 10));

            if (transactions.length > 0) {
                let txnY = currentYForTxn + 25;

                doc.moveTo(mm(15), mm(txnY)).lineTo(mm(195), mm(txnY)).stroke();
                doc.moveTo(mm(15), mm(txnY + 8)).lineTo(mm(195), mm(txnY + 8)).stroke();

                doc.font('Helvetica-Bold').fontSize(9);
                doc.text("Date", mm(18), mm(txnY + 3));
                doc.text("Category", mm(50), mm(txnY + 3));
                doc.text("Description", mm(90), mm(txnY + 3));
                doc.text("Type", mm(150), mm(txnY + 3));
                doc.text("Amount", mm(175), mm(txnY + 3));

                txnY += 12;
                doc.font('Helvetica').fontSize(8);
                
                transactions.slice(0, 35).forEach((txn) => {
                    if(txnY > 260) {
                        doc.addPage();
                        txnY = 20;
                    }
                    const date = txn.createdAt ? new Date(txn.createdAt).toLocaleDateString('en-GB') : "N/A";
                    const category = (txn.category || "General").substring(0, 20);
                    const desc = (txn.description || "N/A").substring(0, 35);
                    const type = txn.type;
                    const amt = Number(txn.amount) || 0;

                    doc.text(date, mm(18), mm(txnY));
                    doc.text(category, mm(50), mm(txnY));
                    doc.text(desc, mm(90), mm(txnY));
                    doc.text(type, mm(150), mm(txnY));
                    doc.text(`Rs. ${amt.toLocaleString('en-IN')}`, mm(175), mm(txnY));
                    
                    doc.moveTo(mm(15), mm(txnY + 6)).lineTo(mm(195), mm(txnY + 6)).strokeColor('#eeeeee').stroke();
                    doc.strokeColor('black');

                    txnY += 8;
                });
                
                if(transactions.length > 35) {
                    doc.text(`... and ${transactions.length - 35} more transactions.`, mm(18), mm(txnY + 5));
                }
            } else {
                let txnY = currentYForTxn + 25;
                doc.font('Helvetica').fontSize(10).text("No transactions found.", mm(20), mm(txnY));
            }

            // Footer / Signatory
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
            doc.font('Helvetica').text(`Rs. ${(userData.stats?.totalSpent || 0).toLocaleString('en-IN')}`, mm(60), mm(139));

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
                    doc.text(`Rs. ${price.toLocaleString('en-IN')}`, mm(170), mm(currentY));
                    
                    doc.moveTo(mm(15), mm(currentY + 6)).lineTo(mm(195), mm(currentY + 6)).strokeColor('#eeeeee').stroke();
                    doc.strokeColor('black');

                    currentY += 8;
                });
                
                if(rides.length > 40) {
                    doc.text(`... and ${rides.length - 40} more rides.`, mm(18), mm(currentY + 5));
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
