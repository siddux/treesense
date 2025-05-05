import * as vscode from 'vscode';
import { log } from './logger';

/**
 * Generate hover content for custom C++ BehaviorTree node tags.
 */
export async function provideNodeHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    nodeIndex: Map<string, vscode.Location[]>
): Promise<vscode.Hover | null> {
    const lineText = document.lineAt(position.line).text;
    const tagRange = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
    if (!tagRange) return null;
    const before = lineText.slice(0, tagRange.start.character);
    if (!/<\/?\s*$/.test(before)) return null;

    const tag = document.getText(tagRange);
    log(`Node hover: found tag="${tag}"`);
    const defs = nodeIndex.get(tag) || [];
    if (defs.length === 0) return null;

    const defLoc = defs[0];
    try {
        const doc = await vscode.workspace.openTextDocument(defLoc.uri);
        const sigLine = doc.lineAt(defLoc.range.start.line).text.trim();
        log(`Node hover: signature="${sigLine}"`);

        // Extract and parse Doxygen
        const comment = extractCommentBlock(doc, defLoc.range.start.line);
        const sections = parseDoxygen(comment);

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### **${tag}**  \n`);
        md.appendCodeblock(sigLine, 'cpp');

        if (sections.brief) {
            md.appendMarkdown(`**${sections.brief}**  \n\n`);
        }
        if (sections.description.length) {
            md.appendMarkdown(sections.description.join(' ') + '\n\n');
        }
        const { inputPorts, outputPorts } = sections;

        md.appendMarkdown('**Input Ports**  \n');
        if (inputPorts.length) {
            inputPorts.forEach(p => md.appendMarkdown(`- ${p}  \n`));
        } else {
            md.appendMarkdown('_None_  \n');
        }
        md.appendMarkdown('\n');

        md.appendMarkdown('**Output Ports**  \n');
        if (outputPorts.length) {
            outputPorts.forEach(p => md.appendMarkdown(`- ${p}  \n`));
        } else {
            md.appendMarkdown('_None_  \n');
        }
        md.appendMarkdown('\n');

        return new vscode.Hover(md, tagRange);
    } catch (err) {
        log(`Node hover error: ${err}`);
        return null;
    }
}

// Helpers
function extractCommentBlock(
    doc: vscode.TextDocument,
    startLine: number
): string[] {
    const lines: string[] = [];
    let inBlock = false;
    for (let i = startLine - 1; i >= 0; --i) {
        const txt = doc.lineAt(i).text.trim();
        if (txt.endsWith('*/')) {
            lines.unshift(txt);
            inBlock = true;
            continue;
        }
        if (inBlock) {
            lines.unshift(txt);
            if (txt.startsWith('/**')) {
                break;
            }
        }
        if (!inBlock && !txt.startsWith('*') && !txt.startsWith('//')) {
            break;
        }
    }
    return lines;
}

function parseDoxygen(lines: string[]) {
    // Clean markers exactly as before…
    const clean = lines
        .map(l =>
            l
                .replace(/^\s*\/\*\*?/, '')   // strip /** or /*
                .replace(/\*\/\s*$/, '')      // strip */
                .replace(/^\s*\*\s?/, '')     // strip leading *
                .trim()
        );

    const sections = {
        brief: '',
        description: [] as string[],
        inputPorts: [] as string[],
        outputPorts: [] as string[],
    };
    type Sec = keyof typeof sections;
    let current: Sec = 'description';

    for (const line of clean) {
        if (!line) continue; // skip blanks

        // @brief
        if (line.startsWith('@brief')) {
            sections.brief = line.replace('@brief', '').trim();
            current = 'description';
            continue;
        }
        // Input Ports:
        if (/^Input Ports\s*:/i.test(line)) {
            current = 'inputPorts';
            continue;
        }
        // Output Ports:
        if (/^Output Ports\s*:/i.test(line)) {
            current = 'outputPorts';
            continue;
        }

        // capture ports entries
        if (current === 'inputPorts' || current === 'outputPorts') {
            const entry = line.replace(/^-+\s*/, '').trim();
            sections[current].push(entry);
            continue;
        }

        // fallback: description
        sections.description.push(line);
    }

    return sections;
}  