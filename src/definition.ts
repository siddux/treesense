import * as vscode from 'vscode';

import {log} from './logger';

type TreeIndex = Map<string, vscode.Location[]>;

export function registerDefinitionProvider(
    context: vscode.ExtensionContext, treeIndex: TreeIndex) {
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(
      {scheme: 'file', language: 'xml'}, {
        provideDefinition(document, position) {
          const wordRange =
              document.getWordRangeAtPosition(position, /"[^"]+"/);
          if (!wordRange) {
            log('Definition: no quoted word under cursor');
            return;
          }
          const treeId = document.getText(wordRange).replace(/"/g, '');
          const locs = treeIndex.get(treeId) || [];
          log(`Definition requested for "${treeId}" → ${
              locs.length} location(s)`);
          return locs;
        }
      }));
}
