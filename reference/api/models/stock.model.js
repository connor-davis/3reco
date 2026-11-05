const mongoose = require("mongoose");
const StockSchema = require("../schemas/stock.schema");

module.exports = mongoose.model("Stock", StockSchema);