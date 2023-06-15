let APICall = require('../models/APICall');
async function trackAPICall(req, res, next) {
    const apiCall = new APICall({
        apiKeyType: req.headers.apikeytype,
        apiKey: req.headers.pythagoraapikey || '',
        endpoint: req.originalUrl
    });
    await apiCall.save();
    next();
}

module.exports = {
    trackAPICall
};
