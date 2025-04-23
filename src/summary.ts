import {XMLParser} from 'fast-xml-parser';
import * as vscode from 'vscode';

import {log} from './logger';
import {BehaviorTreeNode, isBTNode} from './model';

// Cache a single parser instance for performance
export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});


export function findAllBehaviorTrees(obj: any): BehaviorTreeNode[] {
  const results: BehaviorTreeNode[] = [];
  if (obj && typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'BehaviorTree') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (isBTNode(item)) {
              results.push(item);
            }
          }
        } else if (isBTNode(val)) {
          results.push(val);
        }
      } else if (val && typeof val === 'object') {
        results.push(...findAllBehaviorTrees(val));
      }
    }
  }
  return results;
}

export async function buildTreeSummary(
    uri: vscode.Uri, treeId: string): Promise<string> {
  log(`buildTreeSummary: reading ${uri.fsPath}`);

  const xmlText = (await vscode.workspace.openTextDocument(uri)).getText();

  let json: any;
  try {
    json = parser.parse(xmlText);
  } catch (parseErr) {
    log(`XML parse error: ${parseErr}`);
    throw parseErr;
  }

  const allBTs = findAllBehaviorTrees(json);
  log(`Found ${allBTs.length} BehaviorTree node(s)`);

  const bts = allBTs.find(bt => bt['@_ID'] === treeId);
  if (!bts) {
    const msg = `Tree ID "${treeId}" not found`;
    log(msg);
    throw new Error(msg);
  }

  const lines: string[] = [];
  function walk(tag: string, node: BehaviorTreeNode, depth: number) {
    const indent = '  '.repeat(depth);

    const attrs = Object.entries(node)
                      .filter(([k]) => k.startsWith('@_'))
                      .map(([k, v]) => `${k.substring(2)}="${v}"`)
                      .join(' ');
    const childKeys =
        Object.keys(node).filter(k => !k.startsWith('@_') && k !== '#text');

    if (childKeys.length === 0) {
      lines.push(`${indent}- <${tag}${attrs ? ' ' + attrs : ''} />`);
    } else {
      lines.push(`${indent}- <${tag}${attrs ? ' ' + attrs : ''}>`);

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
  }

  walk('BehaviorTree', bts, 0);
  log(`buildTreeSummary complete for "${treeId}" (${lines.length} lines)`);
  return lines.join('\n');
}