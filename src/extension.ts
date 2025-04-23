import {XMLParser} from 'fast-xml-parser';
import * as vscode from 'vscode';

const out = vscode.window.createOutputChannel('TreeSense');

function log(msg: string) {
  const debug =
      vscode.workspace.getConfiguration('treesense').get<boolean>('debug');
  if (debug) {
    out.appendLine(`🐛 ${msg}`);
  }
}

type TreeIndex = Map<string, vscode.Location[]>;

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('🚀 TreeSense is now active!');

  const treeIndex: TreeIndex = new Map();
  log('Starting initial workspace index');
  indexWorkspaceTrees(treeIndex).then(() => {
    log(`Initial index complete: ${treeIndex.size} tree IDs`);
  });

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.xml');
  watcher.onDidCreate(uri => {
    log(`File created: ${uri.fsPath}`);
    updateIndexForFile(uri, treeIndex);
  });
  watcher.onDidChange(uri => {
    log(`File changed: ${uri.fsPath}`);
    updateIndexForFile(uri, treeIndex);
  });
  watcher.onDidDelete(uri => {
    log(`File deleted: ${uri.fsPath}`);
    removeFileFromIndex(uri, treeIndex);
  });
  context.subscriptions.push(watcher);

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
          if (locations.length === 0) {
            return null;
          }

          const loc = locations[0];
          let summary: string;
          try {
            log(`Hover: building summary for "${treeId}"`);
            summary = await buildTreeSummary(loc.uri, treeId);
            log(`Hover: summary built (${summary.split('\n').length} lines)`);
          } catch (err) {
            log(`Hover: buildTreeSummary error: ${err}`);
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
  log('Scanning workspace for XML files…');
  const uris = await vscode.workspace.findFiles('**/*.xml');
  log(`Found ${uris.length} XML file(s)`);
  await Promise.all(uris.map(uri => updateIndexForFile(uri, index)));
}

async function updateIndexForFile(uri: vscode.Uri, index: TreeIndex) {
  log(`Indexing file ${uri.fsPath}`);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.getText();

    for (const [id, locs] of index) {
      const filtered = locs.filter(loc => loc.uri.fsPath !== uri.fsPath);
      if (filtered.length) {
        index.set(id, filtered);
      } else {
        index.delete(id);
        log(`Removed tree ID "${id}" (no more defs)`);
      }
    }

    const regex = /<BehaviorTree\s+ID=["']([^"']+)["']/g;
    let m: RegExpExecArray|null;
    while ((m = regex.exec(text))) {
      const id = m[1];
      const pos = doc.positionAt(m.index);
      const loc = new vscode.Location(uri, pos);
      const arr = index.get(id) || [];
      arr.push(loc);
      index.set(id, arr);
      log(`Indexed "${id}" at ${uri.fsPath}:${pos.line + 1}`);
    }
  } catch (err) {
    log(`Error indexing ${uri.fsPath}: ${err}`);
  }
}

function removeFileFromIndex(uri: vscode.Uri, index: TreeIndex) {
  log(`Removing file ${uri.fsPath} from index`);
  for (const [id, locs] of index) {
    const filtered = locs.filter(loc => loc.uri.fsPath !== uri.fsPath);
    if (filtered.length) {
      index.set(id, filtered);
    } else {
      index.delete(id);
      log(`Deleted tree ID "${id}" completely`);
    }
  }
}

function findAllBehaviorTrees(obj: any): any[] {
  const results: any[] = [];
  if (obj && typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'BehaviorTree') {
        if (Array.isArray(val)) {
          results.push(...val);
        } else {
          results.push(val);
        }
      } else if (val && typeof val === 'object') {
        results.push(...findAllBehaviorTrees(val));
      }
    }
  }
  return results;
}

async function buildTreeSummary(
    uri: vscode.Uri, treeId: string): Promise<string> {
  log(`buildTreeSummary: reading ${uri.fsPath}`);
  try {
    const xmlText = (await vscode.workspace.openTextDocument(uri)).getText();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    let json: any;
    try {
      json = parser.parse(xmlText);
    } catch (parseErr) {
      log(`XML parse error: ${parseErr}`);
      throw parseErr;
    }

    const allBTs = findAllBehaviorTrees(json);
    log(`Found ${allBTs.length} BehaviorTree node(s)`);

    const bts = allBTs.find((bt: any) => bt['@_ID'] === treeId);
    if (!bts) {
      const msg = `Tree ID "${treeId}" not found in JSON`;
      log(msg);
      throw new Error(msg);
    }

    const lines: string[] = [];
    function walk(tag: string, node: any, depth: number) {
      const indent = '  '.repeat(depth);
      const attrs = Object.entries(node)
                        .filter(([k]) => k.startsWith('@_'))
                        .map(([k, v]) => `${k.substring(2)}="${v}"`)
                        .join(' ');
      const childKeys =
          Object.keys(node).filter(k => !k.startsWith('@_') && k !== '#text');

      if (childKeys.length === 0) {
        lines.push(`${indent}- <${tag}${attrs ? ' ' + attrs : ''} />`);
        return;
      } else {
        lines.push(`${indent}- <${tag}${attrs ? ' ' + attrs : ''}>`);
      }

      for (const key of childKeys) {
        const val = node[key];
        if (Array.isArray(val)) {
          for (const childNode of val) {
            walk(key, childNode, depth + 1);
          }
        } else if (val && typeof val === 'object') {
          walk(key, val, depth + 1);
        } else {
          const indent2 = '  '.repeat(depth + 1);
          lines.push(`${indent2}- <${key} />`);
        }
      }

      lines.push(`${indent}- </${tag}>`);
    }

    walk('BehaviorTree', bts, 0);
    log(`buildTreeSummary complete for "${treeId}" (${lines.length} lines)`);
    return lines.join('\n');
  } catch (err) {
    log(`buildTreeSummary error for "${treeId}": ${err}`);
    throw err;
  }
}
