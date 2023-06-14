const mongoose = require("mongoose");
const v4 = require("uuid").v4;

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: { type: String, unique: true },
    apiKey: { type: String, default: () => v4() },
    usage: { type: Array, default: [] },
    maxRequests: { type: Number },
    maxTokens: { type: Number },
    role: { type: String, enum: ['free', 'premium', 'enterprise'], default: 'free' },
    googleId: String,
    githubId: String
});

UserSchema.methods.setRoleProperties = function () {
    const limits = JSON.parse(process.env.LIMITS);
    this.maxRequests = limits[this.role].maxRequests;
    this.maxTokens = limits[this.role].maxTokens;
};

UserSchema.methods.getUsage = function() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Filter usage array to only include last 30 days
    const last30DaysUsage = this.usage.filter(usage => new Date(usage.date) >= thirtyDaysAgo);

    // Calculate total tokens used in last 30 days
    return {
        tokens: last30DaysUsage.reduce((total, usage) => total + usage.tokens, 0),
        requests: last30DaysUsage.length
    };
}

UserSchema.methods.updateUsage = async function(tokens) {
    this.usage.push({
        date: new Date(),
        tokens
    });
    await this.save();
};

module.exports = mongoose.model('User', UserSchema);
