const Mongoose = require('mongoose');
const { Schema } = Mongoose;

const APICallSchema = new Schema({
    _id: {
        type: Schema.ObjectId,
        auto: true
    },
    apiKeyType: {
        type: String,
        trim: true
    },
    apiKey: {
        type: String,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = Mongoose.model('ApiCall', APICallSchema);
