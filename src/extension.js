const vscode = require('vscode');
const { exec, execFile } = require('child_process');
const path = require('path');

let diagnosticCollection;
let findingsProvider;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('agentguard');
    context.subscriptions.push(diagnosticCollection);

    findingsProvider = new FindingsProvider();
    vscode.window.registerTreeDataProvider('agentguard.findings', findingsProvider);

    // Commands
    const scanCmd = vscode.commands.registerCommand('agentguard.scan', () => scanCurrentFile(context));
    const scanWorkspaceCmd = vscode.commands.registerCommand('agentguard.scanWorkspace', () => scanWorkspace(context));
    const showRulesCmd = vscode.commands.registerCommand('agentguard.showRules', () => showRules());
    const goToFindingCmd = vscode.commands.registerCommand('agentguard.goToFinding', (finding) => goToFinding(finding));

    context.subscriptions.push(scanCmd, scanWorkspaceCmd, showRulesCmd, goToFindingCmd);

    // Scan on save if enabled
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (vscode.workspace.getConfiguration('agentguard').get('scanOnSave')) {
                scanDocument(doc);
            }
        })
    );
}

function getPythonPath() {
    return vscode.workspace.getConfiguration('agentguard').get('pythonPath', 'python');
}

function getMinSeverity() {
    return vscode.workspace.getConfiguration('agentguard').get('minSeverity', 'MEDIUM');
}

function scanCurrentFile(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active file to scan.');
        return;
    }
    scanDocument(editor.document);
}

function scanDocument(document) {
    const filePath = document.uri.fsPath;
    const ext = path.extname(filePath).toLowerCase();

    const scanable = ['.py', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.rb', '.go', '.rs', '.sh', '.yaml', '.yml', '.json', '.toml'];
    if (!scanable.includes(ext)) {
        vscode.window.showInformationMessage(`AgentGuard: File type ${ext} not supported.`);
        return;
    }

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AgentGuard: Scanning...',
        cancellable: false
    }, (progress) => {
        return new Promise((resolve) => {
            const python = getPythonPath();
            const cmd = `${python} -m agentguard.cli "${filePath}" --format json --min-severity ${getMinSeverity()}`;

            exec(cmd, { cwd: path.dirname(filePath), timeout: 30000 }, (err, stdout, stderr) => {
                if (stdout) {
                    try {
                        const result = JSON.parse(stdout);
                        applyFindings(document.uri, result.findings || []);
                    } catch (e) {
                        // Parse error
                    }
                }
                resolve();
            });
        });
    });
}

function scanWorkspace(context) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showWarningMessage('No workspace open.');
        return;
    }

    const target = workspaceFolders[0].uri.fsPath;
    const python = getPythonPath();

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AgentGuard: Scanning workspace...',
        cancellable: false
    }, (progress) => {
        return new Promise((resolve) => {
            const cmd = `${python} -m agentguard.cli "${target}" --format json --min-severity ${getMinSeverity()}`;

            exec(cmd, { timeout: 120000 }, (err, stdout) => {
                if (stdout) {
                    try {
                        const result = JSON.parse(stdout);
                        const findings = result.findings || [];

                        // Group findings by file
                        const byFile = {};
                        findings.forEach(f => {
                            if (!byFile[f.file]) byFile[f.file] = [];
                            byFile[f.file].push(f);
                        });

                        // Apply diagnostics per file
                        Object.entries(byFile).forEach(([file, fileFindings]) => {
                            const uri = vscode.Uri.file(file);
                            applyFindings(uri, fileFindings);
                        });

                        // Update tree view
                        findingsProvider.update(findings);

                        const summary = `AgentGuard: ${findings.length} findings — ${result.critical_count || 0} critical, ${result.high_count || 0} high, ${result.medium_count || 0} medium`;
                        if (findings.length === 0) {
                            vscode.window.showInformationMessage('AgentGuard: ✅ No vulnerabilities found.');
                        } else {
                            vscode.window.showWarningMessage(summary);
                        }
                    } catch (e) {
                        vscode.window.showErrorMessage('AgentGuard: Failed to parse results. Is dfx-agentguard installed?');
                    }
                } else {
                    vscode.window.showErrorMessage('AgentGuard: Scan failed. Make sure dfx-agentguard is installed: pip install dfx-agentguard');
                }
                resolve();
            });
        });
    });
}

function applyFindings(uri, findings) {
    const diagnostics = findings.map(f => {
        const range = new vscode.Range(
            Math.max(0, f.line - 1), f.column || 0,
            Math.max(0, f.line - 1), (f.column || 0) + 200
        );

        const severity = {
            'CRITICAL': vscode.DiagnosticSeverity.Error,
            'HIGH': vscode.DiagnosticSeverity.Error,
            'MEDIUM': vscode.DiagnosticSeverity.Warning,
            'LOW': vscode.DiagnosticSeverity.Information,
            'INFO': vscode.DiagnosticSeverity.Hint,
        }[f.severity] || vscode.DiagnosticSeverity.Warning;

        const diag = new vscode.Diagnostic(
            range,
            `[${f.severity}] ${f.rule_name}: ${f.description}`,
            severity
        );
        diag.source = 'AgentGuard';
        diag.code = f.rule_id;
        return diag;
    });

    diagnosticCollection.set(uri, diagnostics);
}

function showRules() {
    const python = getPythonPath();
    exec(`${python} -c "from agentguard.rules import ALL_RULES; [print(f'{r.rule_id} | {r.rule_name} | {r.severity.value} | {r.owasp.value if r.owasp else \"N/A\"}') for r in ALL_RULES]"`, (err, stdout) => {
        if (stdout) {
            const panel = vscode.window.createWebviewPanel(
                'agentguardRules',
                'AgentGuard Detection Rules',
                vscode.ViewColumn.One,
                {}
            );
            panel.webview.html = formatRulesHtml(stdout);
        } else {
            vscode.window.showErrorMessage('AgentGuard: Could not load rules. Is dfx-agentguard installed?');
        }
    });
}

function formatRulesHtml(rulesText) {
    const lines = rulesText.trim().split('\n');
    const rows = lines.map(line => {
        const [id, name, severity, owasp] = line.split('|').map(s => s.trim());
        const color = { 'CRITICAL': '#ff4444', 'HIGH': '#ff8800', 'MEDIUM': '#ffcc00', 'LOW': '#4488ff', 'INFO': '#888' }[severity] || '#888';
        return `<tr><td><code>${id}</code></td><td>${name}</td><td style="color:${color};font-weight:bold">${severity}</td><td>${owasp}</td></tr>`;
    }).join('');

    return `<html><body style="font-family: -apple-system, sans-serif; padding: 20px;">
        <h1>🛡️ AgentGuard Detection Rules</h1>
        <p>All 10 OWASP ASI Top 10 categories covered.</p>
        <table style="border-collapse: collapse; width: 100%;">
            <tr style="border-bottom: 2px solid #333;"><th align="left">Rule ID</th><th align="left">Name</th><th align="left">Severity</th><th align="left">OWASP</th></tr>
            ${rows}
        </table>
        <p style="margin-top: 20px; color: #888;">Install: <code>pip install dfx-agentguard</code></p>
    </body></html>`;
}

function goToFinding(finding) {
    if (!finding || !finding.file) return;
    const uri = vscode.Uri.file(finding.file);
    vscode.window.showTextDocument(uri, {
        selection: new vscode.Range(finding.line - 1, 0, finding.line - 1, 200)
    });
}

class FindingsProvider {
    constructor() {
        this.findings = [];
    }

    update(findings) {
        this.findings = findings;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        const item = new vscode.TreeItem(element.rule_name);
        item.description = `[${element.severity}] ${element.file}:${element.line}`;
        item.tooltip = `${element.description}\n\nFix: ${element.recommendation}`;
        item.command = { command: 'agentguard.goToFinding', title: 'Go to Finding', arguments: [element] };
        item.iconPath = new vscode.ThemeIcon({
            'CRITICAL': 'error',
            'HIGH': 'warning',
            'MEDIUM': 'info',
            'LOW': 'lightbulb',
            'INFO': 'circle-small'
        }[element.severity] || 'info');
        return item;
    }

    getChildren(element) {
        if (!element) {
            return Promise.resolve(this.findings);
        }
        return Promise.resolve([]);
    }
}

function deactivate() {}

module.exports = { activate, deactivate };
