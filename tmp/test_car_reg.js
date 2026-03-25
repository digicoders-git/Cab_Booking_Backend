async function loginAndCreateCar() {
    try {
        const loginRes = await fetch('http://localhost:5000/api/fleet/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: "fleet@example.com",
                password: "fleet123"
            })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('Token obtained:', token);

        const carData = {
            carNumber: "UP32 KK 7001",
            carModel: "Swift DZire",
            carBrand: "Maruti",
            carType: "69bd53c7b37aab9a75dc8e17",
            seatCapacity: 4,
            carColor: "White",
            manufacturingYear: 2023
        };

        const carRes = await fetch('http://localhost:5000/api/fleet/cars/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(carData)
        });
        const finalData = await carRes.json();
        console.log('Car Creation Result:', JSON.stringify(finalData, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    }
}

loginAndCreateCar();
