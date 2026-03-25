const mongoose = require("mongoose");
const carCategorySchema = new mongoose.Schema({
  seatLayout: {
    type: [String],
    default: []
  }
});
const CarCategory = mongoose.model("CarCategory", carCategorySchema);

async function test() {
    const seatLayoutFromForm = '["Front","Back-Left","Back-Middle","Back-Right"]';
    const newCategory = new CarCategory({
        seatLayout: seatLayoutFromForm
    });
    console.log("Without parsing:", newCategory.seatLayout);
    
    const newCategoryParsed = new CarCategory({
        seatLayout: JSON.parse(seatLayoutFromForm)
    });
    console.log("With parsing:", newCategoryParsed.seatLayout);
}

test();
