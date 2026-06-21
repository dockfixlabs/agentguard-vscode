# AgentGuard — VS Code Extension

> **Scan AI agent code for security vulnerabilities directly in VS Code.** Inline diagnostics for OWASP ASI Top 10 vulnerabilities.

[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

## Features

- 🔍 **Scan current file** — Right-click → "AgentGuard: Scan Current File"
- 📁 **Scan entire workspace** — Command palette → "AgentGuard: Scan Workspace"
- 🏷️ **Inline diagnostics** — Findings appear as squiggly underlines in your editor
- 🌳 **Findings tree view** — All findings in the AgentGuard sidebar panel
- ⚡ **Scan on save** — Optional automatic scanning on file save
- 📋 **10 OWASP ASI rules** — Prompt injection, tool abuse, data exfiltration, and more
- 🎨 **Severity colors** — Critical (red), High (orange), Medium (yellow), Low (blue)

## Requirements

```bash
pip install dfx-agentguard
```

## Usage

1. Open a Python/JavaScript/TypeScript file with AI agent code
2. Run "AgentGuard: Scan Workspace" from the command palette (`Ctrl+Shift+P`)
3. View findings as inline diagnostics + in the sidebar tree view
4. Click any finding to jump to the source location

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `agentguard.minSeverity` | `MEDIUM` | Minimum severity to report |
| `agentguard.scanOnSave` | `false` | Auto-scan on file save |
| `agentguard.pythonPath` | `python` | Python executable path |

## Supported Languages

Python, JavaScript, TypeScript, JSX/TSX, Ruby, Go, Rust, Bash, YAML, JSON, TOML

## License

MIT
