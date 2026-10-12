const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/Carbooking').then(async () => {
    try {
        const result = await mongoose.connection.db.collection('drivers').updateOne(
            { _id: new mongoose.Types.ObjectId('6ac5f81cf1f6839ed6af1c6f') },
            { $set: { currentRideType: null, availableSeats: 4, currentHeading: null, isAvailable: true, seatMap: [] } }
        );
        console.log('Driver fixed:', result.modifiedCount);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
});
