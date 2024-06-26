import * as vscode from 'vscode';
import fs from 'node:fs';
import getSystemFonts from 'get-system-fonts';
import path from 'node:path';
import { DocumentPanel } from './DocumentPanel';
import { generatePdf } from './generatePdf';
import TelemetryReporter from '@vscode/extension-telemetry';

const pageSizes = ["A5", "A4", "A3", "US Letter", "US Legal"];
let outputChannel: vscode.OutputChannel;
let telemetry: boolean;
let telemetryReporter: TelemetryReporter;

module.exports.activate = async (context: vscode.ExtensionContext) => {
	const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('latexPreview');
	//telemetry = config?.get('telemetry') ?? false;
	telemetry = false;
	if (telemetry) {
		telemetryReporter = new TelemetryReporter(
			context.extension.packageJSON.aiKey
		);
	};
	context.subscriptions.push(telemetryReporter);
	if (telemetry) {
		telemetryReporter?.sendTelemetryEvent('extension-activated');
	};
	if (vscode.window.activeTextEditor?.document?.fileName) {
		const editor = vscode.window.activeTextEditor;		
		const ext = path.extname(editor.document.fileName);
		if (ext === '.tex' || ext === '.latex') {
			const latexFontDir: string = config?.get('latexFontDir') ?? '';
			const fontFiles = await getSystemFonts({additionalFolders: [latexFontDir], extensions: ['ttf', 'otf']});
			const fontMap = new Map();	
			fontFiles?.forEach(fontFile => {
				fontMap.set(path.basename(fontFile), path.dirname(fontFile));
			});
			outputChannel = vscode.window.createOutputChannel('LaTeX Preview');
			const fontCachePath = path.join(context.extensionUri.fsPath, 'font-cache');
			if (!fs.existsSync(fontCachePath)) {
				fs.mkdirSync(fontCachePath);
			}

			/* Check the version of the luaotfload package */
			const logFileName = editor.document.fileName.replace(ext, '.log');
			if (fs.existsSync(logFileName)) {
				const logFileStr = fs.readFileSync(logFileName, 'utf8');
				if (logFileStr) {
					const strPos = logFileStr.indexOf('Lua module: luaotfload');
					if (strPos > -1) {
						const luaOtfLoadStr = logFileStr.substring(strPos, strPos+39);
						const luaOtfLoadVerStr = luaOtfLoadStr.substring(luaOtfLoadStr.length-5, luaOtfLoadStr.length);
						const luaOtfLoadVer = Number.parseFloat(luaOtfLoadVerStr);
						if (luaOtfLoadVer < 3.23) {
							vscode.window.showWarningMessage('luaotfload package older than v3.23 detected. Fonts may not be loaded correctly.' );
						}
					}
				}
			}

			let disposable = vscode.commands.registerCommand('latex-preview.preview', () => {
				if (telemetry) {
					telemetryReporter?.sendTelemetryEvent('preview-command');
				};
				const editor = vscode.window.activeTextEditor;
				if (editor)	{
					DocumentPanel.documentPathUri = vscode.Uri.file(path.dirname(editor.document.fileName));
					const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('latexPreview');
					const dpi: number = config?.get('dpi') ?? 96;
					const pageSize: string = config?.get('pageSize') ?? "A4";
					const mag: number = config?.get('mag') ?? 100;		
					const debugMode: boolean = config?.get('debugMode') ?? false;				
					const pageBufferSize: number =  config?.get('pageBufferSize') ?? 2;
					const pageGap: number = config?.get('pageGap') ?? 0;
					DocumentPanel.createOrShow(
						context.extensionUri, editor, fontMap, fontCachePath, dpi, pageSize, mag,
						pageBufferSize, pageGap, debugMode, outputChannel);
					if (DocumentPanel.currentPanel) {
						DocumentPanel.currentPanel.generateDocument(editor, telemetryReporter);
					}
				}
			});
			context.subscriptions.push(disposable);			

			disposable = vscode.commands.registerCommand('latex-preview.generatePdf', () => {
				if (telemetry) {
					telemetryReporter?.sendTelemetryEvent('generate-pdf-command');
				};
				if (vscode.window.activeTextEditor?.document?.fileName) {
					const editor = vscode.window.activeTextEditor;
					const ext: string = path.extname(editor.document.fileName);
					if (ext === '.tex' || ext === '.latex') {
						generatePdf(editor.document.fileName, outputChannel, telemetryReporter);
					}
				}
			});
			context.subscriptions.push(disposable);	
		
			disposable = vscode.window.onDidChangeTextEditorVisibleRanges(e => {
				if (e.textEditor?.document?.fileName === DocumentPanel.currentPanel?.editor?.document?.fileName) {
					const topmostLineNumber = DocumentPanel.currentPanel.getTopmostLine(e.textEditor);
					if (topmostLineNumber) {
						DocumentPanel.currentPanel.scrollDocument(topmostLineNumber);
					}
				}
			});
			context.subscriptions.push(disposable);	
		
			disposable = vscode.workspace.onDidSaveTextDocument( async (e: vscode.TextDocument) => {	
				if (vscode.window.activeTextEditor && e.fileName === DocumentPanel.currentPanel?.editor?.document?.fileName) {
					DocumentPanel.currentPanel.generateDocument(vscode.window.activeTextEditor, telemetryReporter);
				}
			});
			context.subscriptions.push(disposable);

			disposable = vscode.commands.registerCommand('latex-preview.setPageSize', async () => {
				if (DocumentPanel.currentPanel?.editor) {
					const pageSize = await vscode.window.showQuickPick(pageSizes,
						{ title: "Select a page size...", placeHolder: DocumentPanel.currentPanel.pageSize, ignoreFocusOut: true, canPickMany: false});
					if (pageSize) {
						DocumentPanel.currentPanel.pageSize = pageSize;
						DocumentPanel.currentPanel.pageSizeChanged();
						DocumentPanel.currentPanel.generateDocument(DocumentPanel.currentPanel.editor, telemetryReporter);
					}
				}
			});
			context.subscriptions.push(disposable);				

			disposable = vscode.commands.registerCommand('latex-preview.magIncrease', () => {
				if (DocumentPanel.currentPanel?.editor) {
					DocumentPanel.currentPanel.mag += 10;
					DocumentPanel.currentPanel.magnificationChanged();
					DocumentPanel.currentPanel.generateDocument(DocumentPanel.currentPanel.editor, telemetryReporter);
				}
			});
			context.subscriptions.push(disposable);		
		
			disposable = vscode.commands.registerCommand('latex-preview.magDecrease', () => {
				if (DocumentPanel.currentPanel?.editor) {
					DocumentPanel.currentPanel.mag -= 10;
					DocumentPanel.currentPanel.magnificationChanged();
					DocumentPanel.currentPanel.generateDocument(DocumentPanel.currentPanel.editor, telemetryReporter);
				}
			});
			context.subscriptions.push(disposable);		

			disposable = vscode.commands.registerCommand('latex-preview.setMagnification', async () => {
				if (DocumentPanel.currentPanel?.editor) {
					const mag = await vscode.window.showInputBox(
						{ title: "Enter magnification value (%)...",
						  validateInput: (value) => {
							const val = parseInt(value);
							if (Number.isNaN(val) || val < 50 || val > 200) {
								return "Enter a integer value between 50 an 200";
							}
						  },
						  placeHolder: DocumentPanel.currentPanel.mag.toString(),
						  ignoreFocusOut: true });
					if (mag) {
						DocumentPanel.currentPanel.mag = parseInt(mag);
						DocumentPanel.currentPanel.magnificationChanged();
						DocumentPanel.currentPanel.generateDocument(DocumentPanel.currentPanel.editor, telemetryReporter);
					}
				}
			});
			context.subscriptions.push(disposable);						

			disposable = vscode.commands.registerCommand('latex-preview.exportDocument', () => {
				if (telemetry) {
					telemetryReporter?.sendTelemetryEvent('export-command');
				}
				if (DocumentPanel.currentPanel?.editor) {
					DocumentPanel.currentPanel.exportDocument(telemetryReporter);
				}
			});
			context.subscriptions.push(disposable);	
		}			
	}
};

module.exports.deactivate = () => {
	outputChannel.dispose();
};
