const mongoose = require("mongoose");
const MaterialSchema = require("../schemas/material.schema");

module.exports = mongoose.model("Material", MaterialSchema);