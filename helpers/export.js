const fs = require('fs');
const path = require('path');
const {
    EXPORTED_TESTS_DIR,
    EXPORTED_TESTS_DATA_DIR,
    PYTHAGORA_METADATA_DIR,
    METADATA_FILENAME,
    EXPORT_METADATA_FILENAME,
    SRC_TO_ROOT,
    MIN_TOKENS_FOR_GPT_RESPONSE,
    MAX_GPT_MODEL_TOKENS
} = require('../const/common');
const {getAllGeneratedTests, updateMetadata} = require("../utils/common");
const {getJestTestFromPythagoraData, getJestTestName, getJestAuthFunction, getPromptFromFile} = require("../helpers/openai");
// const {testExported, pleaseCaptureLoginTestLog, enterLoginRouteLog, testEligibleForExportLog} = require("../utils/cmdPrint");
const _ = require('lodash');

async function createDefaultFiles(generatedTests) {
    if (!fs.existsSync('jest.config.js')) {
        fs.copyFileSync(path.join(__dirname, '../templates/jest-config.js'), './jest.config.js');
    }

    if (!fs.existsSync(`./${EXPORTED_TESTS_DIR}/jest-global-setup.js`)) {
        fs.copyFileSync(path.join(__dirname, '../templates/jest-global-setup.js'), `./${EXPORTED_TESTS_DIR}/global-setup.js`);
    }

    if (!fs.existsSync(`./${EXPORTED_TESTS_DIR}/auth.js`)) {
        await configureAuthFile(generatedTests);
    }
}

async function configureAuthFile(generatedTests) {
    // TODO make require path better
    let pythagoraMetadata = require(`../${SRC_TO_ROOT}.pythagora/${METADATA_FILENAME}`);
    let loginPath = _.get(pythagoraMetadata, 'exportRequirements.login.endpointPath');
    let loginRequestBody = _.get(pythagoraMetadata, 'exportRequirements.login.requestBody');
    let loginMongoQueries = _.get(pythagoraMetadata, 'exportRequirements.login.mongoQueriesArray');

    if (!loginPath) {
        enterLoginRouteLog();
        process.exit(1);
    }

    if (!loginRequestBody || !loginMongoQueries) {
        let loginTest = generatedTests.find(t => t.endpoint === loginPath && t.method !== 'OPTIONS');
        if (loginTest) {
            _.set(pythagoraMetadata, 'exportRequirements.login.mongoQueriesArray', loginTest.intermediateData.filter(d => d.type === 'mongodb'));
            _.set(pythagoraMetadata, 'exportRequirements.login.requestBody', loginTest.body);
            updateMetadata(pythagoraMetadata);
        } else {
            pleaseCaptureLoginTestLog(loginPath);
            process.exit(1);
        }
    }

    let loginData = pythagoraMetadata.exportRequirements.login;
    let gptResponse = await getJestAuthFunction(loginData.mongoQueriesArray, loginData.requestBody, loginData.endpointPath);
    let code = cleanupGPTResponse(gptResponse);

    fs.writeFileSync(`./${EXPORTED_TESTS_DIR}/auth.js`, code);
}

function configurePrepareDbFile() {
    // TODO
}

function cleanupGPTResponse(gptResponse) {
    if (gptResponse.substring(0, 3) === "```") {
        gptResponse = gptResponse.substring(gptResponse.indexOf('\n') + 2, gptResponse.lastIndexOf('```'));
    }

    return gptResponse;
}

function cleanupDataFolder() {
    const pythagoraTestsFolderPath = `./${EXPORTED_TESTS_DIR}`;
    const dataFolderPath = `./${EXPORTED_TESTS_DATA_DIR}`;

    try {
        // Read the files in the ./pythagora_tests/data folder
        const files = fs.readdirSync(dataFolderPath);

        files.forEach((file) => {
            const filePathInPythagoraTests = path.join(pythagoraTestsFolderPath, file.replace('.json', '.test.js'));

            // Check if the file exists in the pythagora_tests folder
            if (!fs.existsSync(filePathInPythagoraTests)) {
                // File doesn't exist in the pythagora_tests folder, so delete it from the data folder
                const filePathInData = path.join(dataFolderPath, file);
                fs.unlinkSync(filePathInData);
            }
        });
    } catch (err) {
        // console.error('Error deleting files from the data folder:', err);
    }
}

function nameTest(test, usedNames) {

}

async function exportTest(test, res) {
    let gptResponse = await getJestTestFromPythagoraData(test, res);
    let jestTest = cleanupGPTResponse(gptResponse);

    let testName = await getJestTestName(jestTest, []);

    return {jestTest, testName};
}

function testExists(exportsMetadata, testId) {
    return !!exportsMetadata[testId] && exportsMetadata[testId].testName && fs.existsSync(`./${EXPORTED_TESTS_DIR}/${exportsMetadata[testId].testName}`)
}

function saveExportJson(exportsMetadata, test, testName) {
    exportsMetadata[test.id] = {
        endpoint: test.endpoint,
        testName
    };
    fs.writeFileSync(`./${PYTHAGORA_METADATA_DIR}/${EXPORT_METADATA_FILENAME}`, JSON.stringify(exportsMetadata));
}

module.exports = {
    exportTest
}
