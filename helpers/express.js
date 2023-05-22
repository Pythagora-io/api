let APICall = require('../models/APICall');
async function trackAPICall(req, res, next) {
    const apiCall = new APICall({
        apiKeyType: req.headers.apikeytype,
        apiKey: req.headers.apikey
    });
    await apiCall.save();
    next();
}

module.exports = {
    trackAPICall
};
