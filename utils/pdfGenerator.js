const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper to convert millimeters to points (PDFKit uses 72 points per inch)
const mm = (val) => val * 2.83465;

exports.generateBulkBookingReceipt = (booking, res) => {
    return new Promise((resolve, reject) => {
        try {
            // A4 size is [210mm, 297mm]
            const doc = new PDFDocument({ size: 'A4', margin: 0 });

            doc.pipe(res);

            // Path to logo (from frontend assets)
            const logoPath = 'C:\\Users\\vivekvkraj\\OneDrive\\Desktop\\Cab booking\\Carbookig_Website\\Cab_Booking_Website\\src\\assets\\logo.png';
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
            let remainingBalance = offeredPrice - advancePaid;
            
            const isCompleted = booking.status === 'Completed' || booking.finalPayment?.isPaid;

            doc.text("TOTAL PRICE", mm(130), mm(tableBottom + 5));
            doc.text(`${offeredPrice.toLocaleString()}`, mm(180), mm(tableBottom + 5));
            doc.moveTo(mm(80), mm(tableBottom + 10)).lineTo(mm(205), mm(tableBottom + 10)).stroke();

            doc.text("ADVANCE PAID", mm(130), mm(tableBottom + 15));
            doc.text(`${advancePaid.toLocaleString()}`, mm(180), mm(tableBottom + 15));
            doc.moveTo(mm(80), mm(tableBottom + 20)).lineTo(mm(205), mm(tableBottom + 20)).stroke();

            doc.rect(mm(80), mm(tableBottom + 20), mm(125), mm(10)).fill('#E6E6E6');
            doc.fill('#000000'); // Reset text color
            
            if (isCompleted) {
                doc.text("FINAL PAYMENT PAID", mm(130), mm(tableBottom + 24));
                doc.text(`INR ${remainingBalance.toLocaleString()}`, mm(180), mm(tableBottom + 24));
            } else {
                doc.text("REMAINING BALANCE", mm(130), mm(tableBottom + 24));
                doc.text(`INR ${remainingBalance.toLocaleString()}`, mm(180), mm(tableBottom + 24));
            }
            doc.moveTo(mm(80), mm(tableBottom + 30)).lineTo(mm(205), mm(tableBottom + 30)).stroke();

            // 8. Bottom Footer
            doc.fontSize(8);
            doc.text(`Total Amount (in words) : RUPEES ${offeredPrice.toLocaleString()} ONLY`, mm(10), mm(tableBottom + 35));
            
            if (isCompleted) {
                doc.text(`Note: Full payment of INR ${offeredPrice.toLocaleString()} has been settled.`, mm(10), mm(tableBottom + 40));
            } else {
                doc.text(`Note: Balance of INR ${remainingBalance.toLocaleString()} to be paid directly to the fleet owner.`, mm(10), mm(tableBottom + 40));
            }

            doc.font('Helvetica-Bold');
            doc.text("For KWIK CABS", mm(150), mm(tableBottom + 50));
            doc.moveTo(mm(140), mm(tableBottom + 75)).lineTo(mm(200), mm(tableBottom + 75)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(tableBottom + 78));

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
            doc.text(`Total Deal : INR ${booking.offeredPrice?.toLocaleString()}`, mm(130), mm(101));
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
            const securityAmount = Math.round((booking.offeredPrice || 0) * 0.20);
            
            if (isCompleted) {
                doc.text("1", mm(11), mm(currentY));
                doc.text(`Total Deal Value for ${carNames}`, mm(20), mm(currentY));
                doc.text("1", mm(156), mm(currentY));
                doc.font('Helvetica-Bold').text(`${(booking.offeredPrice || 0).toLocaleString()}`, mm(180), mm(currentY));
                
                currentY += 10;
                doc.font('Helvetica');
                doc.text("2", mm(11), mm(currentY));
                doc.text(`Security Deposit Paid (20%)`, mm(20), mm(currentY));
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
                const remainingBalance = (booking.offeredPrice || 0) - advanceAmount;
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
                const descText = `Security Deposit for ${carNames || 'Bulk Deal'} (20%)`;
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
            doc.text("For KWIK CABS", mm(150), mm(tableBottom + 50));
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

            const logoPath = 'C:\\\\Users\\\\vivekvkraj\\\\OneDrive\\\\Desktop\\\\Cab booking\\\\Carbookig_Website\\\\Cab_Booking_Website\\\\src\\\\assets\\\\logo.png';
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
            doc.text("For KWIK CABS", mm(150), mm(tableBottom + 55));
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

            const logoPath = 'C:\\\\Users\\\\vivekvkraj\\\\OneDrive\\\\Desktop\\\\Cab booking\\\\Carbookig_Website\\\\Cab_Booking_Website\\\\src\\\\assets\\\\logo.png';
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
            doc.text("For KWIK CABS", mm(150), mm(tableBottom + 55));
            doc.moveTo(mm(140), mm(tableBottom + 70)).lineTo(mm(200), mm(tableBottom + 70)).stroke();
            doc.text("Authorized Signatory", mm(145), mm(tableBottom + 73));

            doc.end();
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};
