import * as vscode from 'vscode';

import {registerDefinitionProvider} from './definition';
import {registerHoverProvider} from './hover';
import {indexWorkspaceTrees, removeFileFromIndex, updateIndexForFile} from './indexer';
import {log} from './logger';
import {BTSymbolProvider} from './symbols';



type TreeIndex = Map<string, vscode.Location[]>;

export function activate(context: vscode.ExtensionContext) {
  const treeIndex: TreeIndex = new Map();
  log('Starting initial workspace index');
  indexWorkspaceTrees(treeIndex).then(
      () => log(`Initial index complete: ${treeIndex.size} tree IDs`));

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.xml');
  watcher.onDidCreate(uri => updateIndexForFile(uri, treeIndex));
  watcher.onDidChange(uri => updateIndexForFile(uri, treeIndex));
  watcher.onDidDelete(uri => removeFileFromIndex(uri, treeIndex));
  context.subscriptions.push(watcher);

  registerDefinitionProvider(context, treeIndex);
  registerHoverProvider(context, treeIndex);

  vscode.languages.registerDocumentSymbolProvider(
      {scheme: 'file', language: 'xml'}, new BTSymbolProvider());
}