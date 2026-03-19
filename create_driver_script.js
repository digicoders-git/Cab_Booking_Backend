const http = require('http');

const data = JSON.stringify({
    name: "Vivekanand Driver test",
    email: "test_dr@gmail.com",
    phone: "9198765431",
    password: "password123",
    licenseNumber: "DL123456789",
    licenseExpiry: "2030-12-31",
    address: "123 Street Name",
    city: "Lucknow",
    state: "UP",
    pincode: "226001",
    aadhar: "1234 5678 9012",
    pan: "ABCDE1234F",
    accountNumber: "919876543210",
    ifscCode: "SBIN0001",
    accountHolderName: "Vivekanand Raj",
    bankName: "SBI",
    carNumber: "UP32AB1234",
    carModel: "Bolero",
    carBrand: "Mahindra",
    carType: "69b848b685e75e2dec1d09b6",
    seatCapacity: 7,
    carColor: "White",
    manufacturingYear: 2022,
    insuranceExpiry: "2025-05-20",
    permitExpiry: "2026-06-15",
    pucExpiry: "2024-10-10"
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/drivers/register',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let responseBody = '';
    res.on('data', (d) => {
        responseBody += d;
    });
    res.on('end', () => {
        console.log(responseBody);
    });
});

req.on('error', (error) => {
    console.error(error);
});

req.write(data);
req.end();
