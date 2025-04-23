import {XMLParser} from 'fast-xml-parser';
import * as vscode from 'vscode';

console.log('👉 TreeSense: extension.ts loaded');

type TreeIndex = Map<string, vscode.Location[]>;

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('🚀 TreeSense is now active!');
  // 2) Build the index
  const treeIndex: TreeIndex = new Map();
  indexWorkspaceTrees(treeIndex).then(() => {});

  // 3) Watch for XML file changes
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.xml');
  watcher.onDidCreate(uri => {
    updateIndexForFile(uri, treeIndex);
  });
  watcher.onDidChange(uri => {
    updateIndexForFile(uri, treeIndex);
  });
  watcher.onDidDelete(uri => {
    removeFileFromIndex(uri, treeIndex);
  });
  context.subscriptions.push(watcher);

  // 4) Definition provider using the index
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(
      {scheme: 'file', language: 'xml'}, {
        provideDefinition(document, position) {
          const wordRange =
              document.getWordRangeAtPosition(position, /"[^"]+"/);
          if (!wordRange) {
            return;
          }
          const treeId = document.getText(wordRange).replace(/"/g, '');
          const locs = treeIndex.get(treeId) || [];
          return locs;
        }
      }));

  // 5) Hover provider
  context.subscriptions.push(vscode.languages.registerHoverProvider(
      {scheme: 'file', language: 'xml'}, {
        async provideHover(document, position) {
          // A) Find a quoted word
          const wordRange =
              document.getWordRangeAtPosition(position, /"[^"]+"/);
          if (!wordRange) {
            return null;
          }

          // B) Extract the treeId
          const raw = document.getText(wordRange);
          const treeId = raw.slice(1, -1);

          // C) Ensure it’s on the right attribute
          const lineText = document.lineAt(position.line).text;
          if (!/(ID=|main_tree_to_execute=)/.test(lineText)) {
            return null;
          }

          // D) Lookup in the index
          const locations = treeIndex.get(treeId) || [];

          if (locations.length === 0) {
            return null;
          }

          // E) Build the outline
          const loc = locations[0];
          let summary: string;
          try {
            summary = await buildTreeSummary(loc.uri, treeId);
          } catch (err) {
            return null;
          }

          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**BehaviorTree \`${treeId}\` structure:**\n\n`);
          md.appendCodeblock(summary, 'xml');
          return new vscode.Hover(md, wordRange);
        }
      }));
}

async function indexWorkspaceTrees(index: TreeIndex) {
  const uris = await vscode.workspace.findFiles('**/*.xml');
  await Promise.all(uris.map(uri => updateIndexForFile(uri, index)));
}

async function updateIndexForFile(uri: vscode.Uri, index: TreeIndex) {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.getText();

    // Remove old entries for this file
    for (const [id, locs] of index) {
      const filtered = locs.filter(loc => loc.uri.fsPath !== uri.fsPath);
      if (filtered.length) {
        index.set(id, filtered);
      } else {
        index.delete(id);
      }
    }

    // Re-scan for <BehaviorTree ID="…">
    const regex = /<BehaviorTree\s+ID=["']([^"']+)["']/g;
    let m: RegExpExecArray|null;
    while ((m = regex.exec(text))) {
      const id = m[1];
      const pos = doc.positionAt(m.index);
      const loc = new vscode.Location(uri, pos);
      const arr = index.get(id) || [];
      arr.push(loc);
      index.set(id, arr);
    }
  } catch (err) {
  }
}

function removeFileFromIndex(uri: vscode.Uri, index: TreeIndex) {
  for (const [id, locs] of index) {
    const filtered = locs.filter(loc => loc.uri.fsPath !== uri.fsPath);
    if (filtered.length) {
      index.set(id, filtered);
    } else {
      index.delete(id);
    }
  }
}

// Put this *above* your buildTreeSummary in extension.ts
function findAllBehaviorTrees(obj: any): any[] {
  const results: any[] = [];
  if (obj && typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'BehaviorTree') {
        if (Array.isArray(val))
          results.push(...val);
        else
          results.push(val);
      } else if (val && typeof val === 'object') {
        results.push(...findAllBehaviorTrees(val));
      }
    }
  }
  return results;
}

async function buildTreeSummary(
    uri: vscode.Uri, treeId: string): Promise<string> {
  const xmlText = (await vscode.workspace.openTextDocument(uri)).getText();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  const json: any = parser.parse(xmlText);

  const allBTs = findAllBehaviorTrees(json);

  const bts = allBTs.find((bt: any) => bt['@_ID'] === treeId);
  if (!bts) throw new Error(`Couldn't find tree ${treeId}`);

  const lines: string[] = [];
  function walk(tag: string, node: any, depth: number) {
    const indent = '  '.repeat(depth);

    // 1) Gather attributes
    const attrs = Object.entries(node)
                      .filter(([k]) => k.startsWith('@_'))
                      .map(([k, v]) => `${k.substring(2)}="${v}"`)
                      .join(' ');

    // 2) Find child keys (ignore attrs & text)
    const childKeys =
        Object.keys(node).filter(k => !k.startsWith('@_') && k !== '#text');

    // 3) Opening or self-closing
    if (childKeys.length === 0) {
      // no children → self-closing
      lines.push(`${indent}- <${tag}${attrs ? ' ' + attrs : ''} />`);
      return;
    } else {
      lines.push(`${indent}- <${tag}${attrs ? ' ' + attrs : ''}>`);
    }

    // 4) Recurse over children
    for (const key of childKeys) {
      const val = node[key];
      if (Array.isArray(val)) {
        for (const childNode of val) {
          // normal child object
          walk(key, childNode, depth + 1);
        }
      } else if (val && typeof val === 'object') {
        // single child object
        walk(key, val, depth + 1);
      } else {
        // primitive or empty → treat as self-closing tag
        const indent2 = '  '.repeat(depth + 1);
        lines.push(`${indent2}- <${key} />`);
      }
    }

    // 5) Closing tag
    lines.push(`${indent}- </${tag}>`);
  }

  walk('BehaviorTree', bts, 0);
  return lines.join('\n');
}
