# TreeSense

TreeSense is a Visual Studio Code extension that provides rich support for [BehaviorTree.CPP](https://github.com/BehaviorTree/BehaviorTree.CPP) XML definitions. With TreeSense you get:

- **IntelliSense** and **auto-completion** for `<BehaviorTree>` `ID` attributes and built-in BT nodes
- **Go-to-Definition** (Ctrl+Click/F12) from any `ID="…"` or `main_tree_to_execute="…"` reference to the tree’s source file
- **Hover Preview**: an indented, syntax‑highlighted outline of the entire tree structure
- **Outline View**: browse all `<BehaviorTree>` definitions in the file via the Explorer’s Outline pane
- **Debug Logging**: enable detailed logs in the **TreeSense** output channel with the `treesense.debug` setting

## Requirements

- Your workspace must contain XML files following the BehaviorTree.CPP schema (e.g. `*.xml` files with `<BehaviorTree ID="…">` tags).
- The extension uses [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) under the hood; no additional setup is required.

## Extension Settings

This extension contributes the following settings:

| Setting                  | Type    | Default | Description                                                   |
| ------------------------ | ------- | ------- | ------------------------------------------------------------- |
| `treesense.debug`        | boolean | `false` | Enable detailed debug logging in the TreeSense output channel |


## Release Notes

### 0.1.0
- Initial public release with:
  - Snappy workspace-wide indexing & file-watcher support
  - IntelliSense & go-to-definition for tree IDs
  - Hover previews with syntax-highlighted, indented outlines
  - Outline view integration via DocumentSymbolProvider
  - Toggleable debug logging (`treesense.debug`)
