const _ = require("lodash");
const path = require("path");
const fs = require("fs");
const GPT3Tokenizer = require("gpt3-tokenizer");
const {insertVariablesInText} = require("../utils/common");
const https = require("https");
const {MIN_TOKENS_FOR_GPT_RESPONSE, MAX_GPT_MODEL_TOKENS} = require("../const/common");
const { fixImportsAndRequires, cleanupGPTResponse } = require("./postprocessing");
const { Readable } = require('stream');
const Handlebars = require('handlebars');

function getPromptFromFile(fileName, variables) {
    const fileContent = fs.readFileSync(path.join(__dirname, `../prompts/${fileName}`), 'utf8');
    const template = Handlebars.compile(fileContent);
    return template(variables);
}

function getTokensInMessages(messages) {
    let rawMessages = messages.map(message => message.content).join('\n');
    const tokenizer = new GPT3Tokenizer.default({ type: 'gpt3' }); // or 'codex'
    const encodedPrompt = tokenizer.encode(rawMessages);
    return encodedPrompt.text.length;
}

async function createGPTChatCompletion(messages, req, res, minTokens = MIN_TOKENS_FOR_GPT_RESPONSE) {
    const apiKey = req.headers.apikey;
    let tokensInMessages = getTokensInMessages(messages);
    if (tokensInMessages + minTokens > MAX_GPT_MODEL_TOKENS) throw new Error(`Too many tokens in messages: ${tokensInMessages}. Please try a different test.`)

    if (req.user) await req.user.updateUsage(tokensInMessages);

    let gptData = {
        model: "gpt-4",
        n: 1,
        max_tokens: Math.min(4096, MAX_GPT_MODEL_TOKENS - tokensInMessages),
        messages
    };

    try {
        return await streamGPTCompletion(gptData, apiKey, res, req);
    } catch (e) {
        console.error('The request to OpenAI API failed. Might be due to GPT being down or due to the too large message. It\'s best if you try another export.');
        console.error(e);
    }
}

async function getJestTestFromPythagoraData(req, res) {
    req.type = 'integrationTest';
    return await createGPTChatCompletion([
        {"role": "system", "content": "You are a QA engineer and your main goal is to find ways to break the application you're testing. You are proficient in writing automated integration tests for Node.js API servers.\n" +
                "When you respond, you don't say anything except the code - no formatting, no explanation - only code.\n" },
        {
            "role": "user",
            "content": getPromptFromFile('generateJestTest.txt', { testData: req.body }),
        },
    ], req, res);
}

async function getJestTestName(req, res) {
    req.type = 'integrationTestName';
    return await createGPTChatCompletion([
        {"role": "system", "content": "You are a QA engineer and your main goal is to think of good, human readable jest tests file names. You are proficient in writing automated integration tests for Node.js API servers.\n" +
                "When you respond, you don't say anything except the filename - no formatting, no explanation, no code - only filename.\n" },
        {
            "role": "user",
            "content": getPromptFromFile('generateJestTestName.txt', req.body),
        },
    ], req, res,200);
}

function getGPTMessages(req) {
    if (req.type === 'unitTest') {
        return [
            {"role": "system", "content": "You are a QA engineer and your main goal is to find ways to break the application you're testing. You are proficient in writing automated tests for Node.js apps.\n" +
                    "When you respond, you don't say anything except the code - no formatting, no explanation - only code." },
            {
                "role": "user",
                "content": getPromptFromFile('generateJestUnitTest.txt', req.body),
            },
        ]
    } else if (req.type === 'expandUnitTest') {
        return [
            {"role": "system", "content": "You are a QA engineer and your main goal is to extend current automated unit tests in the application you're testing. You are proficient in writing automated tests for Node.js apps.\n" +
                    "When you respond, you don't say anything except the code - no formatting, no explanation - only code. Do not include the codebase from the question" },
            { 
                "role": "user",
                "content": getPromptFromFile('expandJestUnitTest.txt', req.body),
            },
        ]
    }
}

async function getJestUnitTests(req, res, usedNames) {
    req.type = 'unitTest';
    req.body.relatedCode = req.body.relatedCode.map(code => {
        code.fileName = code.fileName.substring(code.fileName.lastIndexOf('/') + 1);
        return code;
    })
    return await createGPTChatCompletion(getGPTMessages(req), req, res,200);
}

async function getExpandedJestUnitTests(req, res, usedNames) {
    req.type = 'expandUnitTest';
    req.body.relatedCode = req.body.relatedCode.map(code => {
        code.fileName = code.fileName.substring(code.fileName.lastIndexOf('/') + 1);
        return code;
    })
    return await createGPTChatCompletion(getGPTMessages(req), req, res,200);
}

async function getJestAuthFunction(req, res) {
    req.type = 'integrationAuthFn';
    let {loginMongoQueriesArray, loginRequestBody, loginEndpointPath} = req.body;
    let prompt = getPromptFromFile('generateJestAuth.txt', {
        loginRequestBody,
        loginMongoQueriesArray,
        loginEndpointPath
    });

    return await createGPTChatCompletion([
        {"role": "system", "content": "You are a QA engineer and your main goal is to find ways to break the application you're testing. You are proficient in writing automated integration tests for Node.js API servers.\n" +
                "When you respond, you don't say anything except the code - no formatting, no explanation - only code.\n" +
                "\n" +
                "You are very careful when asserting IDs because you have experienced that IDs can be different in the database from the IDs that are captured in the API request data from which you're creating tests.\n" +
                "\n" +
                "When you create names for your tests you make sure that they are very intuitive and in a human-readable form."},
        {
            "role": "user",
            "content": prompt,
        },
    ], req, res);
}

async function streamGPTCompletion(data, apiKey, response, req) {
    let body = req.body,
        type = req.type;

    data.stream = true;

    return new Promise((resolve, reject) => {
        let gptResponse = '';
        const req = https.request(
            {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + apiKey,
                },
            },
            (resFromOpenAI) => {
                resFromOpenAI.on('data', (chunk) => {
                    try {
                        let stringified = chunk.toString();
                        try {
                            let json = JSON.parse(stringified);
                            if (json.error || json.message) {
                                response.write(JSON.stringify(json));
                                gptResponse = json;
                                return;
                            }
                        } catch (e) {}
                        let receivedMessages = extractGPTMessageFromStreamData(stringified);
                        receivedMessages.forEach(rm => {
                            let content = _.get(rm, 'choices.0.delta.content');
                            if (content) {
                                gptResponse += content;
                                response.write(content);
                                process.stdout.write(content);
                            }
                        });

                    } catch (e) {}
                });

                resFromOpenAI.on('end', () => {
                    if (gptResponse.error || gptResponse.message) return response.end();
                    const newCode = postprocessing(gptResponse, body, type);
                    response.end(`pythagora_end:${newCode}`);
                    resolve();
                });
            }
        );

        req.on('error', (e) => {
            console.error('problem with request:' + e.message);
            response.statusCode = 500;
            reject(response.end());
        });

        req.write(JSON.stringify(data));
        req.end();
    })
}

function postprocessing(code, functionData, type) {
    let newCode = cleanupGPTResponse(code);

    if (type === 'unitTest') newCode = fixImportsAndRequires(newCode, functionData);

    return newCode;
}

function extractGPTMessageFromStreamData(input) {
    const regex = /data: (.*?)\n/g;
    const substrings = [];
    let match;

    while ((match = regex.exec(input)) !== null) {
        substrings.push(match[1]);
    }

    return substrings.map(s => JSON.parse(s));
}

module.exports = {
    getJestTestFromPythagoraData,
    getJestTestName,
    getJestAuthFunction,
    getTokensInMessages,
    getPromptFromFile,
    getJestUnitTests,
    getExpandedJestUnitTests,
    getGPTMessages
}
