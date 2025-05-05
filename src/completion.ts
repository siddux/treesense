import * as vscode from 'vscode';

export function registerCompletionProvider(context: vscode.ExtensionContext, treeIndex: Map<string, vscode.Location[]>) {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'xml' },
            {
                provideCompletionItems(document, position) {
                    const line = document.lineAt(position.line).text;
                    // Ensure we’re inside an ID="…" or main_tree_to_execute="…"
                    const prefixMatch = line.slice(0, position.character)
                        .match(/(ID=|main_tree_to_execute=)\s*"([^"]*)$/);
                    if (!prefixMatch) {
                        return;
                    }
                    const already = prefixMatch[2];
                    const base = prefixMatch[1];

                    const quoteStart = line.indexOf('"', prefixMatch.index) + 1;
                    const replaceRange = new vscode.Range(
                        position.line,
                        quoteStart,
                        position.line,
                        position.character
                    );

                    // Build completion items
                    return Array.from(treeIndex.keys())
                        .filter(id => id.startsWith(already))
                        .map(id => {
                            const item = new vscode.CompletionItem(
                                id,
                                vscode.CompletionItemKind.Value
                            );
                            item.insertText = id;
                            item.range = replaceRange;
                            return item;
                        });
                }
            },
            '"' // trigger when typing a quote
        )
    );
}
