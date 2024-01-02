const vscode = require("vscode");
const defaultOrderList = require("./orderList");

// Function to process CSS properties
async function processCss() {
  try {
    // Call various functions to organize and clean CSS
    await organizeCssProperties();
    await removeUnnestedProperties();
    await keepFirstOccurrenceWithSameValue();
    await removeBlankLines();
    await findAtSymbolsInCssBlocks();
    await removeBlankLinesAndFormat();
  } catch (error) {
    // Handle errors if necessary
    console.error(error);
  }
}

// Function to organize CSS properties
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

// Function to find "@" symbols in CSS blocks
function findAtSymbolsInCssBlocks() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    // Get the text from the document
    const text = document.getText();

    // Split the text into CSS blocks
    const cssBlocks = text.split(/(?=\s*{[^}]*})/);

    if (cssBlocks) {
      // Check each code block
      cssBlocks.forEach((cssBlock, index) => {
        if (/@/.test(cssBlock)) {
          // If it finds an "@" element within the block
          // Remove the line corresponding to the "@" symbol from the original block
          const lines = cssBlock.split("\n");
          const lineIndex = lines.findIndex((line) => line.includes("@"));

          if (lineIndex !== -1) {
            lines.splice(lineIndex, 1);
          }

          // Update the CSS block in the original text
          cssBlocks[index] = lines.join("\n");
        }
      });

      // Replace the original content of the document with the modified content
      editor.edit((editBuilder) => {
        const startPosition = new vscode.Position(0, 0);
        const endPosition = new vscode.Position(document.lineCount + 1, 0);
        return editBuilder.replace(
          new vscode.Range(startPosition, endPosition),
          cssBlocks.join("\n")
        );
      });
    }
  }
}

// Function to organize properties based on a predefined order
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

// Function to remove non-nested CSS properties
async function removeUnnestedProperties() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const text = document.getText();
    let insideBlock = false;

    // Modify the text by removing non-nested properties
    const newText = text
      .split("\n")
      .map((line) => {
        if (line.includes("{")) {
          insideBlock = true;
          return line;
        }

        if (line.includes("}")) {
          insideBlock = false;
          return line;
        }

        if (insideBlock) {
          return line;
        }

        return line.replace(/(?<!\w|\#|\.)\s*([^{};]+)\s*:\s*([^{};]+)\s*;/g, "");
      })
      .join("\n");

    // Replace the original content of the document with the modified content
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      return editBuilder.replace(new vscode.Range(startPosition, endPosition), newText);
    });
  }

  return Promise.resolve();
}

// Function to get remaining properties after organization
function getRemainingProperties(cssBlock, organizedProperties) {
  const allProperties = cssBlock
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes(":"))
    .join("\n");

  // Remove organized properties from the original text
  const remainingProperties = allProperties.replace(organizedProperties, "");

  // Return remaining properties
  return remainingProperties.trim() ? remainingProperties + "\n" : "";
}

// Function to keep the first occurrence of properties with the same value
async function keepFirstOccurrenceWithSameValue() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const text = document.getText();
    let insideBlock = false;
    let propertiesMap = new Map();

    // Modify the text by keeping the first occurrence of properties with the same value
    const newText = text
      .split("\n")
      .map((line) => {
        if (line.includes("{")) {
          insideBlock = true;
          propertiesMap = new Map();
          return line;
        }

        if (line.includes("}")) {
          insideBlock = false;
          return line;
        }

        if (insideBlock) {
          const properties = line.match(/(?<!\w|\#|\.)\s*([^{};]+)\s*:\s*([^{};]+)\s*;/g);
          if (properties) {
            const updatedProperties = properties.reduce((acc, property) => {
              const [key, value] = property.split(":").map((part) => part.trim());
              if (!propertiesMap.has(key)) {
                propertiesMap.set(key, value);
                acc.push(property);
              }
              return acc;
            }, []);

            // If there are unique properties, keep the line; otherwise, remove the line
            return updatedProperties.length > 0 ? updatedProperties.join("\n") : "";
          }
        }

        return line;
      })
      .join("\n");

    // Replace the original content of the document with the modified content
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      editBuilder.replace(new vscode.Range(startPosition, endPosition), newText);
    });
  }

  return Promise.resolve();
}

// Function to remove blank lines from CSS
function removeBlankLines() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const text = document.getText();
    let newText = "";

    let insideBraces = false;

    for (const line of text.split("\n")) {
      const trimmedLine = line.trim();

      if (trimmedLine.includes("{")) {
        insideBraces = true;
      }

      if (!insideBraces || trimmedLine !== "") {
        newText += line + "\n";
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

// Function to remove blank lines and format the document
async function removeBlankLinesAndFormat() {
  await removeBlankLines();
  await vscode.commands.executeCommand("editor.action.formatDocument");
}

/**
 * Function activated when the extension is started
 * @param {vscode.ExtensionContext} context
 */
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

// Exports the activate function
module.exports = {
  activate,
};
