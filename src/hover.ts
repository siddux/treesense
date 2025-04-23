import * as vscode from 'vscode';

import {log} from './logger';
import {buildTreeSummary} from './summary';

type TreeIndex = Map<string, vscode.Location[]>;

export function registerHoverProvider(
    context: vscode.ExtensionContext, treeIndex: TreeIndex) {
  context.subscriptions.push(vscode.languages.registerHoverProvider(
      {scheme: 'file', language: 'xml'}, {
        async provideHover(document, position) {
          log(`Hover requested at ${position.line + 1}:${
              position.character + 1}`);
          const wordRange =
              document.getWordRangeAtPosition(position, /"[^"]+"/);
          if (!wordRange) {
            log('Hover: no quoted word under cursor');
            return null;
          }
          const raw = document.getText(wordRange);
          const treeId = raw.slice(1, -1);
          log(`Hover: extracted treeId="${treeId}"`);
          const lineText = document.lineAt(position.line).text;
          if (!/(ID=|main_tree_to_execute=)/.test(lineText)) {
            log('Hover: not over tree attribute');
            return null;
          }
          const locations = treeIndex.get(treeId) || [];
          log(`Hover: index returned ${locations.length} location(s)`);
          if (!locations.length) {
            return null;
          }
          try {
            log(`Hover: building summary for "${treeId}"`);
            const summary = await buildTreeSummary(locations[0].uri, treeId);
            log(`Hover: summary built (${summary.split('\n').length} lines)`);
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**BehaviorTree \`${treeId}\` structure:**\n\n`);
            md.appendCodeblock(summary, 'xml');
            return new vscode.Hover(md, wordRange);
          } catch (err) {
            log(`Hover: buildTreeSummary error: ${err}`);
            return null;
          }
        }
      }));
}