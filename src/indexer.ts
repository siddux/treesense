import * as vscode from 'vscode';
import { log } from './logger';

export type TreeIndex = Map<string, vscode.Location[]>;
export type NodeIndex = Map<string, vscode.Location[]>;

const debounceTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 200;  // ms

/**
 * Scan workspace for all XML behavior-tree files
 */
export async function indexWorkspaceTrees(index: TreeIndex) {
  log('Scanning workspace for XML files…');
  const uris = await vscode.workspace.findFiles('**/*.xml');
  log(`Found ${uris.length} XML file(s)`);
  await Promise.all(uris.map(uri => updateIndexForFile(uri, index)));
}

/**
 * Scan workspace for all C++ headers/sources to index custom node classes
 */
export async function indexWorkspaceCppNodes(index: NodeIndex) {
  log('Scanning workspace for C++ files…');
  const uris = await vscode.workspace.findFiles('**/*.{cpp,h,hpp}');
  log(`Found ${uris.length} C++ file(s)`);
  await Promise.all(uris.map(uri => updateIndexForCppFile(uri, index)));
}

/**
 * Debounce XML file indexing
 */
export function scheduleIndex(xmlUri: vscode.Uri, index: TreeIndex) {
  const key = xmlUri.fsPath;
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key)!);
  }
  debounceTimers.set(
    key,
    setTimeout(() => updateIndexForFile(xmlUri, index), DEBOUNCE_DELAY)
  );
}

/**
 * Debounce C++ file indexing
 */
export function scheduleIndexCpp(cppUri: vscode.Uri, index: NodeIndex) {
  const key = cppUri.fsPath;
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key)!);
  }
  debounceTimers.set(
    key,
    setTimeout(() => updateIndexForCppFile(cppUri, index), DEBOUNCE_DELAY)
  );
}

/**
 * Update the tree-index for one XML file
 */
export async function updateIndexForFile(
  uri: vscode.Uri,
  index: TreeIndex
) {
  log(`Indexing XML file ${uri.fsPath}`);
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
        log(`Removed tree ID "${id}" (no more defs)`);
      }
    }
    // Re-scan for <BehaviorTree ID="…">
    const regex = /<BehaviorTree\s+ID=["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text))) {
      const id = m[1];
      const pos = doc.positionAt(m.index);
      const loc = new vscode.Location(uri, pos);
      const arr = index.get(id) || [];
      arr.push(loc);
      index.set(id, arr);
      log(`Indexed tree "${id}" at ${uri.fsPath}:${pos.line + 1}`);
    }
  } catch (err) {
    log(`Error indexing XML ${uri.fsPath}: ${err}`);
  }
}

/**
 * Update the node-index for one C++ file
 */
export async function updateIndexForCppFile(
  uri: vscode.Uri,
  index: NodeIndex
) {
  log(`Indexing C++ file ${uri.fsPath}`);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.getText();
    // Remove old entries for this file
    for (const [name, locs] of index) {
      const filtered = locs.filter(loc => loc.uri.fsPath !== uri.fsPath);
      if (filtered.length) {
        index.set(name, filtered);
      } else {
        index.delete(name);
        log(`Removed node "${name}" (no more defs)`);
      }
    }
    // Scan for class declarations
    const classRegex = /\bclass\s+([A-Za-z_]\w*)/g;
    let m: RegExpExecArray | null;
    while ((m = classRegex.exec(text))) {
      const name = m[1];
      const pos = doc.positionAt(m.index);
      const loc = new vscode.Location(uri, pos);
      const arr = index.get(name) || [];
      arr.push(loc);
      index.set(name, arr);
      log(`Indexed node class "${name}" at ${uri.fsPath}:${pos.line + 1}`);
    }
  } catch (err) {
    log(`Error indexing C++ ${uri.fsPath}: ${err}`);
  }
}

/**
 * Remove all entries from the tree index for a deleted XML file
 */
export function removeFileFromIndex(
  uri: vscode.Uri,
  index: TreeIndex
) {
  log(`Removing XML file ${uri.fsPath} from index`);
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

/**
 * Remove all entries from the node index for a deleted C++ file
 */
export function removeFileFromNodeIndex(
  uri: vscode.Uri,
  index: NodeIndex
) {
  log(`Removing C++ file ${uri.fsPath} from node index`);
  for (const [name, locs] of index) {
    const filtered = locs.filter(loc => loc.uri.fsPath !== uri.fsPath);
    if (filtered.length) {
      index.set(name, filtered);
    } else {
      index.delete(name);
      log(`Deleted node class "${name}" completely`);
    }
  }
}
