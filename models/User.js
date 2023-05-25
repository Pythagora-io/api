const mongoose = require("mongoose");
const v4 = require("uuid").v4;

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: String,
    apiKey: { type: String, default: v4() },
    usage: { type: Number, default: 0 },
    role: { type: String, enum: ['free', 'premium', 'enterprise'], default: 'free' },
    googleId: String,
    githubId: String
});

module.exports = mongoose.model('User', UserSchema);
