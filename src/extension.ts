import * as vscode from 'vscode';

import { registerDefinitionProvider } from './definition';
import { registerHoverProvider } from './hover';
import { indexWorkspaceTrees, removeFileFromIndex, updateIndexForFile, indexWorkspaceCppNodes, scheduleIndexCpp, removeFileFromNodeIndex } from './indexer';
import { log } from './logger';
import { BTSymbolProvider } from './symbols';

type TreeIndex = Map<string, vscode.Location[]>;
type NodeIndex = Map<string, vscode.Location[]>;

export function activate(context: vscode.ExtensionContext) {
    const treeIndex: TreeIndex = new Map();
    const nodeIndex: NodeIndex = new Map();

    log('Starting initial workspace index');
    indexWorkspaceTrees(treeIndex).then(
        () => log(`Initial index complete: ${treeIndex.size} tree IDs`));

    indexWorkspaceCppNodes(nodeIndex).then(() =>
        log(`⚙️ C++ index complete: ${nodeIndex.size} node classes`)
    );

    const watcher = vscode.workspace.createFileSystemWatcher('**/*.xml');
    watcher.onDidCreate(uri => updateIndexForFile(uri, treeIndex));
    watcher.onDidChange(uri => updateIndexForFile(uri, treeIndex));
    watcher.onDidDelete(uri => removeFileFromIndex(uri, treeIndex));
    context.subscriptions.push(watcher);

    const cppWatcher = vscode.workspace.createFileSystemWatcher('**/*.{cpp,h,hpp}');
    cppWatcher.onDidCreate(uri => scheduleIndexCpp(uri, nodeIndex));
    cppWatcher.onDidChange(uri => scheduleIndexCpp(uri, nodeIndex));
    cppWatcher.onDidDelete(uri => removeFileFromNodeIndex(uri, nodeIndex));
    context.subscriptions.push(cppWatcher);

    registerDefinitionProvider(context, treeIndex);
    registerHoverProvider(context, treeIndex, nodeIndex);

    vscode.languages.registerDocumentSymbolProvider(
        { scheme: 'file', language: 'xml' }, new BTSymbolProvider());
}