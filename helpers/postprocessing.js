function fixImportsAndRequires(code, functionData) {
    let functionLookup = {};
    functionData.relatedCode.forEach(func => {
        func.functionNames.forEach(f => {
            functionLookup[f] = func.exportedAsObject;
        });
    });

    const importPattern = /(import\s+((\{\s*(\w+)\s*\})|(.*))\s+from\s+'(\..*)';?\n?)/g;
    const requirePattern = /((var|const|let)\s+((\{\s*(\w+)\s*\})|(.*))\s+=\s+require\('(\..*)'\)(\.default)?;?\n?)/g;

    let imports = '';
    let newCode = code;

    let requireMatches = [...newCode.matchAll(requirePattern)];
    requireMatches = requireMatches.map(match => {
        return {
            fullStatement: match[1],
            importedElement: match[3],
            path: match[7]
        }
    });
    let importMatches = [...newCode.matchAll(importPattern)];
    importMatches = importMatches.map(match => {
        return {
            fullStatement: match[1],
            importedElement: match[2],
            path: match[6]
        }
    });

    requireMatches.concat(importMatches).forEach((match) => {
        const functionName = match.importedElement.startsWith('{') ? match.importedElement.replace(/\{|\}/g, '').trim() : match.importedElement.trim();
        const isExportedAsObject = functionLookup[functionName];

        let correctedStatement;
        if (functionData.isES6Syntax) {
            correctedStatement = isExportedAsObject
                ? `import { ${functionName} } from '${match.path}';`
                : `import ${functionName} from '${match.path}';`;
        } else {
            correctedStatement = isExportedAsObject
                ? `let { ${functionName} } = require('${match.path}');`
                : `let ${functionName} = require('${match.path}');`;
        }

        newCode = newCode.replace(match.fullStatement, '');
        imports += correctedStatement + '\n';
    });

    if (functionData.isES6Syntax && !newCode.trim().startsWith('import')) {
        newCode = imports + '\n' + newCode.trim();
    }

    return newCode;
}

function cleanupGPTResponse(gptResponse) {
    if (gptResponse.substring(0, 3) === "```") {
        gptResponse = gptResponse.substring(gptResponse.indexOf('\n') + 1, gptResponse.lastIndexOf('```'));
    }

    return gptResponse;
}

module.exports = {
    fixImportsAndRequires,
    cleanupGPTResponse
}
