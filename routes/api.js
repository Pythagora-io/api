const express = require('express');
const router = express.Router();
const {
    getJestAuthFunction,
    getJestTestFromPythagoraData,
    getJestTestName,
    getTokensInMessages,
    getPromptFromFile,
    getJestUnitTests
} = require("../helpers/openai");
const {trackAPICall} = require("../helpers/express");
const {MIN_TOKENS_FOR_GPT_RESPONSE, MAX_GPT_MODEL_TOKENS} = require("../const/common");
const User = require("../models/User");

async function apiKeyAuth (req, res, next) {
    const apiKey = req.headers.apikey;
    const apiKeyType = req.headers.apikeytype;
    if (!apiKey) {
        return res.status(401).send('Access denied. No API key provided.');
    }

    if(apiKeyType !== 'pythagora') return next();
    try {
        const user = await User.findOne({ apiKey });
        if (!user) {
            return res.status(401).send('Access denied. Invalid API key.');
        }

        if (!user.maxRequests && user.maxRequests !== 0 && !user.maxTokens && user.maxTokens !== 0) user.getRoleProperties();

        const usage = user.getUsage();

        if (user.maxTokens && user.maxTokens !== 0 && user.maxTokens <= usage.tokens) return res.status(400).send('Reached tokens limit. If you need more tokens let us know on hi@pythagora.ai');

        if (user.maxRequests && user.maxRequests !== 0 && user.maxRequests <= usage.requests) return res.status(400).send('Reached requests limit. If you need more requests let us know on hi@pythagora.ai');

        req.headers.pythagoraapikey = req.headers.apikey;
        req.headers.apikey = process.env.OPENAI_API_KEY;
        req.user = user;
        next();
    } catch (err) {
        res.status(500).send('Error validating API key: ', err);
    }
}


router.post('/generate-negative-tests', apiKeyAuth, trackAPICall, async (req, res) => {
    const user = req.user;
    if (!user) {
        res.status(401).send('Unauthorized');
        return;
    }

    const apiKey = req.body.apiKey;
    const inputData = req.body.data;

    // Check if the user has enough quota for the API requests
    const quota = { free: 100, premium: 1000, enterprise: 10000 }[user.role];
    if (user.usage + inputData.length > quota) {
        res.status(400).send('API request limit exceeded');
        return;
    }

    // Update user's usage
    user.usage += inputData.length;
    await user.save();

    // Call GPT API (implementation not provided)
    // Process the results (implementation not provided)

    res.send('API requests made');
});

router.post('/generate-unit-tests', apiKeyAuth, trackAPICall, async (req, res) => {
    try {
        await getJestUnitTests(req, res);
    } catch (error) {
        res.status(500).end(error.message);
    }
});

router.post('/generate-jest-auth', apiKeyAuth, trackAPICall, async (req, res) => {
    try {
        await getJestAuthFunction(req, res);
    } catch (error) {
        res.status(500).end(error.message);
    }
});

router.post('/generate-jest-test', apiKeyAuth, trackAPICall, async (req, res) => {
    try {
        await getJestTestFromPythagoraData(req, res);
    } catch (error) {
        res.status(500).end(error.message);
    }
});

router.post('/generate-jest-test-name', apiKeyAuth, trackAPICall, async (req, res) => {
    try {
        if (!req.body || !req.body.test) return res.status(400).send('No "test" in body.');

        await getJestTestName(req, res, []);
    } catch (error) {
        res.status(500).end(error.message);
    }
});

router.post('/check-if-eligible', apiKeyAuth, trackAPICall, async (req, res) => {
    try {
        if (!req.body || !req.body.test) return res.status(400).send('No "test" in body.');

        let tokens = getTokensInMessages([
            {"role": "system", "content": "You are a QA engineer and your main goal is to find ways to break the application you're testing. You are proficient in writing automated integration tests for Node.js API servers.\n" +
                    "When you respond, you don't say anything except the code - no formatting, no explanation - only code.\n" },
            {
                "role": "user",
                "content": getPromptFromFile('generateJestTest.txt', { test: req.body.test }),
            },
        ]);

        let isEligibleForExport = (tokens + MIN_TOKENS_FOR_GPT_RESPONSE < MAX_GPT_MODEL_TOKENS);

        return res.status(200).send(isEligibleForExport);
    } catch (error) {
        console.error(error);
        res.sendStatus(500); // Set an appropriate error status code
    }
});

module.exports = router;
