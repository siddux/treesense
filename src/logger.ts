import * as vscode from 'vscode';

export const out = vscode.window.createOutputChannel('TreeSense');

export function log(msg: string) {
  const debug =
      vscode.workspace.getConfiguration('treesense').get<boolean>('debug');
  if (debug) {
    out.appendLine(`🐛 ${msg}`);
  }
}