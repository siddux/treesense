import * as vscode from 'vscode';

import {log} from './logger';
import {BehaviorTreeNode} from './model';
import {findAllBehaviorTrees, parser} from './summary';

export class BTSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
      document: vscode.TextDocument, token: vscode.CancellationToken):
      vscode.ProviderResult<vscode.DocumentSymbol[]> {
    log('SymbolProvider: scanning document for BehaviorTree nodes');
    const text = document.getText();

    let json: any;
    try {
      json = parser.parse(text);
    } catch (err) {
      log(`SymbolProvider: XML parse error: ${err}`);
      return [];
    }

    const allBTs = findAllBehaviorTrees(json) as BehaviorTreeNode[];
    log(`SymbolProvider: found ${allBTs.length} BehaviorTree node(s)`);
    const symbols: vscode.DocumentSymbol[] = [];

    for (const bt of allBTs) {
      if (token.isCancellationRequested) {
        log('SymbolProvider: cancellation requested');
        break;
      }
      const id = bt['@_ID'];
      if (!id) {
        log('SymbolProvider: skipping node without @ID');
        continue;
      }

      const openTag = `<BehaviorTree ID=\"${id}\"`;
      const startOffset = text.indexOf(openTag);
      if (startOffset === -1) {
        log(`SymbolProvider: start tag not found for ID=${id}`);
        continue;
      }
      const startPos = document.positionAt(startOffset);

      const closeTag = '</BehaviorTree>';
      const endOffsetRaw = text.indexOf(closeTag, startOffset);
      const endPos = endOffsetRaw !== -1 ?
          document.positionAt(endOffsetRaw + closeTag.length) :
          startPos;

      const btSymbol = new vscode.DocumentSymbol(
          `BehaviorTree: ${id}`, '', vscode.SymbolKind.Namespace,
          new vscode.Range(startPos, endPos),
          new vscode.Range(startPos, startPos));

      for (const [tag, child] of Object.entries(bt)) {
        if (tag.startsWith('@_') || tag === '#text') continue;
        const childName = Array.isArray(child) ? `${tag}[]` : tag;
        const childOffset = text.indexOf(`<${tag}`, startOffset);
        if (childOffset !== -1) {
          const childPos = document.positionAt(childOffset);
          btSymbol.children.push(new vscode.DocumentSymbol(
              childName, '', vscode.SymbolKind.Class,
              new vscode.Range(childPos, childPos),
              new vscode.Range(childPos, childPos)));
        }
      }

      symbols.push(btSymbol);
    }

    return symbols;
  }
}
