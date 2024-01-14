const vscode = require("vscode");
const defaultOrderList = require("./orderList");
/** * @param {vscode.ExtensionContext} context */

async function activate(context) {
  console.log('Congratulations, your extension "csspro-sorter" is now active!');

  // Registers the command "csspro-sorter.OrganizeCSS"
  let disposable = vscode.commands.registerCommand("csspro-sorter.OrganizeCSS", async function () {
    vscode.window.showInformationMessage("CSS Organized!");
    try {
      await processCss();
    } catch (error) {
      console.error(error);
    }
  });

  // Registers the command "csspro-sorter.resetSettings"
  let resetDisposable = vscode.commands.registerCommand(
    "csspro-sorter.resetSettings",
    async function () {
      // Resets the settings to default values
      await vscode.workspace
        .getConfiguration("cssPROSorter")
        .update("propertiesToOrganize", undefined, true);
      await vscode.workspace.getConfiguration("cssPROSorter").update("resetSettings", true, true);
      await vscode.workspace.getConfiguration("cssPROSorter").update("resetSettings", false, true);

      // Displays a message indicating that it is necessary to restart VS Code
      const restartMessage = "Please restart VS Code to apply the settings reset.";
      vscode.window.showInformationMessage(
        "CSSPRO Sorter settings reset to default. " + restartMessage
      );
    }
  );

  // Adds the commands to the list of subscriptions
  context.subscriptions.push(disposable, resetDisposable);

  // Handles the reset when activating the extension
  const shouldResetSettings = vscode.workspace
    .getConfiguration("cssPROSorter")
    .get("resetSettings", false);
  if (shouldResetSettings) {
    // Resets the settings to default values
    await vscode.workspace
      .getConfiguration("cssPROSorter")
      .update("propertiesToOrganize", undefined, true);
    await vscode.workspace.getConfiguration("cssPROSorter").update("resetSettings", false, true);

    vscode.window.showInformationMessage("CSSPRO Sorter settings reset to default.");
  }
}

module.exports = {
  activate,
};

// * Main Function
async function processCss() {
  try {
    await formatStyleSheet();

    // * Organize Funcions
    await organizeCssProperties();
    await removeDuplicateProperties();

    // ! Fix Bug transform selectors in properties
    await removeEmptyLines();
    await organizePropertiesBasedOnConflits();

    await formatStyleSheet();
  } catch (error) {
    console.error(error);
  }
}
/* ---------------------------------------------------------------------------------- */
/* ------------------- Remove empty lines and format the document ------------------- */
/* ---------------------------------------------------------------------------------- */

async function formatStyleSheet() {
  await removeEmptyLines();
  await vscode.commands.executeCommand("editor.action.formatDocument");
}

/* ------------------------------- Remove empty lines ------------------------------- */

function removeEmptyLines() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const text = document.getText();
    let newText = "";

    for (const line of text.split("\n")) {
      if (line.trim() !== "") {
        newText += line + "\n";
      }
    }

    // Replace the original content of the document with the modified content
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      editBuilder.replace(new vscode.Range(startPosition, endPosition), newText.trim());
    });
  }

  return Promise.resolve();
}

/* ---------------------------------------------------------------------------------- */
/* ---------------------------- Organize Css Properties ----------------------------- */
/* ---------------------------------------------------------------------------------- */

async function organizeCssProperties() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const useCustomProperties = vscode.workspace
      .getConfiguration("cssPROSorter")
      .get("useCustomProperties", false);

    let propertiesToOrganize;

    if (useCustomProperties) {
      propertiesToOrganize = vscode.workspace
        .getConfiguration("cssPROSorter")
        .get("propertiesToOrganize", []);
    } else {
      // Use the default list if the custom list is not being used
      propertiesToOrganize = defaultOrderList;
    }

    // Get the text from the document
    const text = document.getText();

    // Split the text into CSS blocks
    const cssBlocks = text.split(/(?=\s*{[^}]*})/);

    // Map each CSS block and organize the properties
    const organizedBlocks = cssBlocks.map((cssBlock) => {
      const properties = cssBlock
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.includes(":"))
        .join("\n");

      // Added support for nested media blocks
      const organizedProperties = organizeProperties(properties, propertiesToOrganize);

      // Find and remove only the last property starting with "@" if it's alone on a line
      const modifiedProperties = organizedProperties.replace(/@[^;]+;(?:(?!@).)*$/, "");

      // Adjustments to ensure correct formatting inside the .project block
      let formattedBlock = cssBlock.replace(/(\s*{[^}]*})/, `{\n${modifiedProperties}\n}\n\n`);

      return formattedBlock;
    });

    // Replace the original content of the document with the organized content
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      return editBuilder.replace(
        new vscode.Range(startPosition, endPosition),
        organizedBlocks.join("\n")
      );
    });
  }

  return Promise.resolve();
}

/* ----------------- Organize properties based on a predefined order ---------------- */

function organizeProperties(properties, customPropertiesToOrganize) {
  // Create an object to track already seen properties
  const seenProperties = new Set();

  // Split existing properties by line
  const propertyLines = properties.split(/\n/);

  // Organize desired properties
  const organizedProperties = customPropertiesToOrganize
    .map((property) => {
      const regex = new RegExp(`^\\s*(${property.replace("-", "\\-")})\\s*:\\s*.+?;\\s*$`);
      const matchingLines = propertyLines.filter((line) => regex.test(line));

      if (matchingLines.length > 0) {
        const normalizedMatches = matchingLines.map((matchingLine) =>
          matchingLine.replace(/\s+/g, "")
        );
        normalizedMatches.forEach((normalizedMatch) => seenProperties.add(normalizedMatch));
        return matchingLines.join("\n");
      }

      return "";
    })
    .filter(Boolean) // Remove empty strings
    .join("\n");

  // Remove organized properties from the original text
  const remainingProperties = propertyLines
    .filter((line) => {
      const normalizedLine = line.replace(/\s+/g, "");
      return !seenProperties.has(normalizedLine);
    })
    .join("\n");

  // Return organized properties without extra space
  return organizedProperties.trim() + "\n" + remainingProperties.trim();
}

/* ---------------------------------------------------------------------------------- */
/* ------------------------- Remove duplicate CSS properties ------------------------ */
/* ---------------------------------------------------------------------------------- */

function removeDuplicateProperties() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const text = document.getText();
    let newText = "";

    let insideBraces = false;
    let linesWithinBlock = new Set();

    for (const line of text.split("\n")) {
      const trimmedLine = line.trim();

      if (trimmedLine.includes("{")) {
        insideBraces = true;
        linesWithinBlock = new Set();
      }

      if (!insideBraces || !linesWithinBlock.has(trimmedLine)) {
        newText += line + "\n";
        linesWithinBlock.add(trimmedLine);
      }

      if (trimmedLine.includes("}")) {
        insideBraces = false;
      }
    }

    // Replace the original content of the document with the modified content
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      editBuilder.replace(new vscode.Range(startPosition, endPosition), newText.trim());
    });
  }

  return Promise.resolve();
}

/* ---------------------------------------------------------------------------------- */
/* ------------------- Fix Bug transform selectors in properties -------------------- */
/* ---------------------------------------------------------------------------------- */

async function organizePropertiesBasedOnConflits() {
  const count = countLinesWithCommaAndColon();

  if (count > 0) {
    for (let i = 0; i < count; i++) {
      await yourOrganizePropertiesFunction();
    }
  }
}

async function yourOrganizePropertiesFunction() {
  await separateLastPropertyIfIncomplete();
  await removeEverythingBeforeClosingBrace();
}

/* -------------------- Separate selectors placed like properties ------------------- */

function separateLastPropertyIfIncomplete() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const text = document.getText();
    const lines = text.split("\n");

    let newText = "";
    let previousLineHadSemicolon = false;

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i].trim();

      if (currentLine.includes("}")) {
        // Check if the previous line does not end with a semicolon
        if (!previousLineHadSemicolon) {
          // Remove the previous line
          newText = newText.trim();
        }
      }

      // Add the current line to the modified text
      newText += currentLine + "\n";

      // Update the flag for the next iteration
      previousLineHadSemicolon = currentLine.endsWith(";");
    }

    // Replace the original content of the document with the modified content
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      editBuilder.replace(new vscode.Range(startPosition, endPosition), newText.trim());
    });
  }

  return Promise.resolve();
}

/* --------------------- Remove selectors placed like properties -------------------- */

function removeEverythingBeforeClosingBrace() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const text = document.getText();
    const lines = text.split("\n");

    let newText = "";

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i].trim();

      if (currentLine.endsWith("}") && currentLine !== "}}") {
        // The line ends with "}" and is not "}}"
        // Keep only the last "}"
        newText += "}" + "\n";
      } else {
        // Keep the line as it is
        newText += currentLine + "\n";
      }
    }

    // Replace the original content of the document with the modified content
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      editBuilder.replace(new vscode.Range(startPosition, endPosition), newText.trim());
    });
  }

  return Promise.resolve();
}

/* ---------- Define how many times need to fix the separated "properties" ---------- */

function countLinesWithCommaAndColon() {
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    const text = editor.document.getText();
    const lines = text.split("\n");

    let count = 0;

    for (const line of lines) {
      if (line.includes(",") && line.includes(":")) {
        count++;
      }
    }
    return count;
  } else {
    vscode.window.showErrorMessage("Nenhum editor ativo.");
    return 0;
  }
}
