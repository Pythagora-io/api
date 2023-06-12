const _ = require("lodash");
const path = require("path");
const fs = require("fs");
const GPT3Tokenizer = require("gpt3-tokenizer");
const {insertVariablesInText} = require("../utils/common");
const https = require("https");
const {MIN_TOKENS_FOR_GPT_RESPONSE, MAX_GPT_MODEL_TOKENS} = require("../const/common");
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

async function createGPTChatCompletion(messages, apiKey, res, minTokens = MIN_TOKENS_FOR_GPT_RESPONSE) {
    let tokensInMessages = getTokensInMessages(messages);
    if (tokensInMessages + minTokens > MAX_GPT_MODEL_TOKENS) throw new Error(`Too many tokens in messages: ${tokensInMessages}. Please try a different test.`)

    let gptData = {
        model: "gpt-4",
        n: 1,
        max_tokens: Math.min(4096, MAX_GPT_MODEL_TOKENS - tokensInMessages),
        messages
    };

    try {
        return await streamGPTCompletion(gptData, apiKey, res);
    } catch (e) {
        console.error('The request to OpenAI API failed. Might be due to GPT being down or due to the too large message. It\'s best if you try another export.')
        process.exit(1);
    }
}

async function getJestTestFromPythagoraData(req, res) {
    return await createGPTChatCompletion([
        {"role": "system", "content": "You are a QA engineer and your main goal is to find ways to break the application you're testing. You are proficient in writing automated integration tests for Node.js API servers.\n" +
                "When you respond, you don't say anything except the code - no formatting, no explanation - only code.\n" },
        {
            "role": "user",
            "content": getPromptFromFile('generateJestTest.txt', { testData: req.body }),
        },
    ], req.headers.apikey, res);
}

async function getJestTestName(req, res, usedNames) {
    return await createGPTChatCompletion([
        {"role": "system", "content": "You are a QA engineer and your main goal is to think of good, human readable jest tests file names. You are proficient in writing automated integration tests for Node.js API servers.\n" +
                "When you respond, you don't say anything except the filename - no formatting, no explanation, no code - only filename.\n" },
        {
            "role": "user",
            "content": getPromptFromFile('generateJestTestName.txt', { test: req.body.test, usedNames }),
        },
    ], req.headers.apikey, res,200, true);
}

function getGPTMessages(req, type) {
    if (type === 'unit') {
        return [
            {"role": "system", "content": "You are a QA engineer and your main goal is to find ways to break the application you're testing. You are proficient in writing automated tests for Node.js apps.\n" +
                    "When you respond, you don't say anything except the code - no formatting, no explanation - only code." },
            {
                "role": "user",
                "content": getPromptFromFile('generateJestUnitTest.txt', req.body),
            },
        ]
    }
}

async function getJestUnitTests(req, res, usedNames) {
    req.body.relatedCode = req.body.relatedCode.map(code => {
        code.fileName = code.fileName.substring(code.fileName.lastIndexOf('/') + 1);
        return code;
    })
    return await createGPTChatCompletion(getGPTMessages(req, 'unit'), req.headers.apikey, res,200, true);
}

async function getJestAuthFunction(req, res) {
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
    ], req.headers.apikey, res);
}

async function streamGPTCompletion(data, apiKey, response) {
    data.stream = true;

    return new Promise((resolve, reject) => {
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
                let gptResponse = '';

                // Create a readable stream to capture the response data
                const readableStream = new Readable({
                    read() {
                        // This is an empty implementation of the _read() method
                    },
                });

                resFromOpenAI.on('data', (chunk) => {
                    try {
                        readableStream.push(chunk);
                        let stringified = chunk.toString();
                        try {
                            let json = JSON.parse(stringified);
                            if (json.error || json.message) gptResponse = json;
                            return;
                        } catch (e) {}
                        let receivedMessages = extractGPTMessageFromStreamData(stringified);
                        receivedMessages.forEach(rm => {
                            let content = _.get(rm, 'choices.0.delta.content');
                            if (content) {
                                gptResponse += content;
                                process.stdout.write(content);
                            }
                        });

                    } catch (e) {}
                });

                resFromOpenAI.on('end', () => {
                    let resEnd = typeof gptResponse === 'string' ||
                    gptResponse instanceof Buffer ||
                    gptResponse instanceof Uint8Array ? gptResponse : JSON.stringify(gptResponse);
                    response.end('pythagora_end:' + resEnd);
                });

                readableStream.pipe(response);
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
    getGPTMessages
}
