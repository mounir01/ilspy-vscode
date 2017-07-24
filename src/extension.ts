'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import * as util from './common';
import { Logger } from './logger';
import { PlatformInformation } from './platform';
import { MsilDecompilerServer } from './msildecompiler/server';
import { DecompiledTreeProvider, MemberNode } from './msildecompiler/decompiledTreeProvider';
import { Options } from './msildecompiler/options';

let textEditor: vscode.TextEditor = null;

export function activate(context: vscode.ExtensionContext) {

    const extensionId = 'jeremymeng.msil-decompiler';
    const extension = vscode.extensions.getExtension(extensionId);
    const extensionVersion = extension.packageJSON.version;
    const aiKey = extension.packageJSON.aiKey;
    const reporter = new TelemetryReporter(extensionId, extensionVersion, aiKey);

    util.setExtensionPath(extension.extensionPath);

    const server = new MsilDecompilerServer(reporter);
    let decompileTreeProvider = new DecompiledTreeProvider(server);

    console.log('Congratulations, your extension "msil-decompiler" is now active!');

    decompileTreeProvider = new DecompiledTreeProvider(server);
    let _treeDisposable = vscode.window.registerTreeDataProvider("msilDecompiledMembers", decompileTreeProvider);
    context.subscriptions.push(_treeDisposable);

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('msildecompiler.decompileAssembly', () => {
        // The code you place here will be executed every time your command is executed
        pickAssembly().then(assembly => {
            server.restart(assembly).then(() => {
                decompileTreeProvider.refresh();
            });
        });
    });

    context.subscriptions.push(disposable);

    let lastSelectedNode: MemberNode = null;

    disposable = vscode.commands.registerCommand('showDecompiledCode', (node: MemberNode) => {
        if (lastSelectedNode === node) {
            return;
        }

        lastSelectedNode = node;
        if (node.decompiled) {
            showCode(node.decompiled);
        }
        else {
            decompileTreeProvider.getCode(node).then(code => {
                node.decompiled = code;
                showCode(node.decompiled);
            });
        }
	});

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function showCode(code: string) {
    if (!textEditor) {
        vscode.workspace.openTextDocument(
            {
                "content": code,
                "language": "csharp"
            }
        ).then(document => {
            vscode.window.showTextDocument(document).then(editor => textEditor = editor);
        });
    }
    else {
        vscode.commands.executeCommand("editor.action.selectAll").then(() =>{
            textEditor.edit(editBuilder => editBuilder.replace(textEditor.selection, code));
            vscode.commands.executeCommand("cursorMove", {"to": "viewPortTop"});
        });
    }
}

function pickAssembly(): Thenable<string> {
    return findAssemblies().then(assemblies => {
        return vscode.window.showQuickPick(assemblies);
    });
}

function findAssemblies(): Thenable<string[]> {
    if (!vscode.workspace.rootPath) {
        return Promise.resolve([]);
    }

    const options = Options.Read();

    return vscode.workspace.findFiles(
        /*include*/ '{**/*.dll,**/*.exe,**/*.winrt,**/*.netmodule}',
        /*exclude*/ '{**/node_modules/**,**/.git/**,**/bower_components/**}')
    .then(resources => {
        return resources.map(uri => uri.fsPath);
    });
}
