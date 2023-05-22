function insertVariablesInText(text, variables) {
    let variableNames = Object.keys(variables);
    for (let variableName of variableNames) {
        let variableValue = typeof variables[variableName] === 'object' ?
            JSON.stringify(variables[variableName], null, 2) : variables[variableName];
        let variableRegex = new RegExp(`{{${variableName}}}`, 'g');
        text = text.replace(variableRegex, variableValue);
    }
    return text;
}

module.exports = {
    insertVariablesInText,
}
