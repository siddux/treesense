import * as vscode from 'vscode';

import { log } from './logger';
import { buildTreeSummary } from './summary';
import { provideNodeHover } from './nodeHover';

export function registerHoverProvider(
  context: vscode.ExtensionContext,
  treeIndex: Map<string, vscode.Location[]>,
  nodeIndex: Map<string, vscode.Location[]>
) {
  const selector: vscode.DocumentFilter = { scheme: 'file', language: 'xml' };
  const provider: vscode.HoverProvider = {
    async provideHover(document, position) {
      log(`Hover requested at ${position.line + 1}:${position.character + 1}`);
      // First, attempt BehaviorTree summary hover
      const treeHover = await tryTreeHover(document, position, treeIndex);
      if (treeHover) {
        return treeHover;
      }
      // If no tree hover, attempt custom-node hover
      return provideNodeHover(document, position, nodeIndex);
    }
  };

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, provider)
  );
}

/**
 * Attempt to produce a hover for a BehaviorTree ID attribute
 */
async function tryTreeHover(
  document: vscode.TextDocument,
  position: vscode.Position,
  treeIndex: Map<string, vscode.Location[]>
): Promise<vscode.Hover | null> {
  const line = document.lineAt(position.line);
  const text = line.text;
  const idRange = document.getWordRangeAtPosition(position, /"[^"]+"/);
  if (!idRange) {
    return null;
  }
  const raw = document.getText(idRange);
  const treeId = raw.slice(1, -1);
  log(`Tree hover: found ID="${treeId}"`);
  if (!/(ID=|main_tree_to_execute=)/.test(text)) {
    return null;
  }
  const locations = treeIndex.get(treeId) || [];
  if (locations.length === 0) {
    return null;
  }
  try {
    log(`Tree hover: building summary for "${treeId}"`);
    const summary = await buildTreeSummary(locations[0].uri, treeId);
    log(`Tree hover: summary built, ${summary.split('\n').length} lines`);
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**BehaviorTree \`${treeId}\` structure:**

`);
    md.appendCodeblock(summary, 'xml');
    return new vscode.Hover(md, idRange);
  } catch (err) {
    log(`Tree hover error: ${err}`);
    return null;
  }
}