const mongoose = require('mongoose');
require('dotenv').config();

const Schema = mongoose.Schema;
const CarCategory = mongoose.model('CarCategory', new Schema({
    name: String,
    image: String
}));

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        const auto = await CarCategory.findById('69cb8506c1a664029f4d40bb');
        if (auto) {
            auto.image = 'top_view_auto.png';
            await auto.save();
            console.log('Successfully reset Auto category image to top_view_auto.png ✅');
        } else {
            console.log('Auto category not found with provided ID ❌');
        }
        mongoose.connection.close();
    })
    .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
