const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema({
    userId: String,
    pathId: String,
    event: String,
    pythagoraVersion: String,
    data: Object
}, {
    timestamps: true
});

module.exports = mongoose.model('Telemetry', telemetrySchema);
