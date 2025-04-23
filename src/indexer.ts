import * as vscode from 'vscode';

import {log} from './logger';

type TreeIndex = Map<string, vscode.Location[]>;

const debounceTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 200;  // ms

export async function indexWorkspaceTrees(index: TreeIndex) {
  log('Scanning workspace for XML files…');
  const uris = await vscode.workspace.findFiles('**/*.xml');
  log(`Found ${uris.length} XML file(s)`);
  await Promise.all(uris.map(uri => updateIndexForFile(uri, index)));
}

export function scheduleIndex(uri: vscode.Uri, index: TreeIndex) {
  const key = uri.fsPath;
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key));
  }
  debounceTimers.set(
      key, setTimeout(() => updateIndexForFile(uri, index), DEBOUNCE_DELAY));
}

export async function updateIndexForFile(uri: vscode.Uri, index: TreeIndex) {
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

export function removeFileFromIndex(uri: vscode.Uri, index: TreeIndex) {
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