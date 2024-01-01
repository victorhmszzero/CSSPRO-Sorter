const vscode = require("vscode");

// Função principal que inicia o processamento das propriedades CSS
async function processCss() {
  try {
    // Chama várias funções para organizar e limpar o CSS
    await organizeCssProperties();
    await removeUnnestedProperties();
    await keepFirstOccurrenceWithSameValue();
    await removeBlankLines();
    await removeBlankLinesAndFormat();
  } catch (error) {
    // Trata erros, se necessário
    console.error(error);
  }
}

// Função para organizar as propriedades CSS
async function organizeCssProperties() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    // Obtém propriedades a serem organizadas das configurações da extensão
    const propertiesToOrganize = vscode.workspace
      .getConfiguration("cssPROSorter")
      .get("propertiesToOrganize", []);

    // Obtém o texto do documento
    const text = document.getText();

    // Divide o texto em blocos CSS
    const cssBlocks = text.split(/(?=\s*{[^}]*})/);

    // Mapeia cada bloco CSS e organiza as propriedades
    const organizedBlocks = cssBlocks.map((cssBlock) => {
      const properties = cssBlock
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.includes(":"))
        .join("\n");

      const organizedProperties = organizeProperties(properties, propertiesToOrganize);
      const remainingProperties = getRemainingProperties(cssBlock, organizedProperties);

      return cssBlock.replace(
        /(\s*{[^}]*})/,
        "{\n" + organizedProperties + "\n}\n\n" + remainingProperties
      );
    });

    // Substitui o conteúdo original do documento pelo conteúdo organizado
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

// Função para organizar propriedades com base em uma ordem predefinida
function organizeProperties(properties, customPropertiesToOrganize) {
  // Cria um objeto para rastrear propriedades já vistas
  const seenProperties = new Set();

  // Organiza propriedades desejadas
  const organizedProperties = customPropertiesToOrganize
    .map((property) => {
      const regex = new RegExp(`(${property})\\s*:\\s*.+?;`, "g");
      const matches = properties.match(regex);
      if (matches) {
        const filteredMatches = matches.filter((match) => !seenProperties.has(match));
        filteredMatches.forEach((match) => seenProperties.add(match));
        return filteredMatches.join("\n");
      }
      return "";
    })
    .filter(Boolean) // Remove strings vazias
    .join("\n");

  // Remove propriedades organizadas do texto original
  const remainingProperties = properties.replace(new RegExp(organizedProperties, "g"), "");

  // Retorna propriedades organizadas sem espaço extra
  return organizedProperties.trim() + "\n" + remainingProperties.trim();
}

// Função para remover propriedades CSS que não estão aninhadas
function removeUnnestedProperties() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const text = document.getText();
    let insideBlock = false;

    // Modifica o texto removendo propriedades não aninhadas
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

    // Substitui o conteúdo original do documento pelo conteúdo modificado
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      return editBuilder.replace(new vscode.Range(startPosition, endPosition), newText);
    });
  }

  return Promise.resolve();
}

// Função para obter propriedades restantes após a organização
function getRemainingProperties(cssBlock, organizedProperties) {
  const allProperties = cssBlock
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes(":"))
    .join("\n");

  // Remove propriedades organizadas do texto original
  const remainingProperties = allProperties.replace(organizedProperties, "");

  // Retorna propriedades restantes
  return remainingProperties.trim() ? remainingProperties + "\n" : "";
}

// Função para manter a primeira ocorrência de propriedades com o mesmo valor
function keepFirstOccurrenceWithSameValue() {
  const editor = vscode.window.activeTextEditor;
  const document = editor && editor.document;

  if (editor && document) {
    const text = document.getText();
    let insideBlock = false;
    let propertiesMap = new Map();

    // Modifica o texto mantendo a primeira ocorrência de propriedades com o mesmo valor
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

            // Se houver propriedades únicas, manter a linha; caso contrário, remover a linha
            return updatedProperties.length > 0 ? updatedProperties.join("\n") : "";
          }
        }

        return line;
      })
      .join("\n");

    // Substitui o conteúdo original do documento pelo conteúdo modificado
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      editBuilder.replace(new vscode.Range(startPosition, endPosition), newText);
    });
  }

  return Promise.resolve();
}

// Função para remover linhas em branco do CSS
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

    // Substitui o conteúdo original do documento pelo conteúdo modificado
    return editor.edit((editBuilder) => {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = new vscode.Position(document.lineCount + 1, 0);
      editBuilder.replace(new vscode.Range(startPosition, endPosition), newText.trim());
    });
  }

  return Promise.resolve();
}

// Função para remover linhas em branco e formatar o documento
async function removeBlankLinesAndFormat() {
  await removeBlankLines();
  await vscode.commands.executeCommand("editor.action.formatDocument");
}

/**
 * Função ativada ao iniciar a extensão
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  console.log('Congratulations, your extension "csspro-sorter" is now active!');

  // Registra o comando "csspro-sorter.OrganizeCSS"
  let disposable = vscode.commands.registerCommand("csspro-sorter.OrganizeCSS", async function () {
    vscode.window.showInformationMessage("CSS Organized!");
    try {
      await processCss();
    } catch (error) {
      console.error(error);
    }
  });

  // Registra o comando "csspro-sorter.resetSettings"
  let resetDisposable = vscode.commands.registerCommand(
    "csspro-sorter.resetSettings",
    async function () {
      // Reseta as configurações para os valores padrão
      await vscode.workspace
        .getConfiguration("cssPROSorter")
        .update("propertiesToOrganize", undefined, true);
      await vscode.workspace.getConfiguration("cssPROSorter").update("resetSettings", true, true);
      await vscode.workspace.getConfiguration("cssPROSorter").update("resetSettings", false, true);

      // Exibe uma mensagem informando que é necessário reiniciar o VS Code
      const restartMessage = "Please restart VS Code to apply the settings reset.";
      vscode.window.showInformationMessage(
        "CSSPRO Sorter settings reset to default. " + restartMessage
      );
    }
  );

  // Adiciona os comandos à lista de subscrições
  context.subscriptions.push(disposable, resetDisposable);

  // Lida com a redefinição ao ativar a extensão
  const shouldResetSettings = vscode.workspace
    .getConfiguration("cssPROSorter")
    .get("resetSettings", false);
  if (shouldResetSettings) {
    // Reseta as configurações para os valores padrão
    await vscode.workspace
      .getConfiguration("cssPROSorter")
      .update("propertiesToOrganize", undefined, true);
    await vscode.workspace.getConfiguration("cssPROSorter").update("resetSettings", false, true);

    vscode.window.showInformationMessage("CSSPRO Sorter settings reset to default.");
  }
}

// Exporta a função activate
module.exports = {
  activate,
};
