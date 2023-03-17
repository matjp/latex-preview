import * as vscode from 'vscode';
import fs from 'node:fs';
import getSystemFonts from 'get-system-fonts';
import path from 'node:path';
import { DocumentPanel } from './DocumentPanel';
import { generatePdf } from './generatePdf';

let outputChannel: vscode.OutputChannel;
let previewStatusBarItem: vscode.StatusBarItem;

module.exports.activate = async (context: vscode.ExtensionContext) => {
	if (vscode.window.activeTextEditor?.document?.fileName) {
		const editor = vscode.window.activeTextEditor;		
		const ext = path.extname(editor.document.fileName);
		if (ext === '.tex' || ext === '.latex') {
			const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('latexPreview');
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
			previewStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
			context.subscriptions.push(previewStatusBarItem);

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
							vscode.window.showWarningMessage('loaotfload package older than v3.23 detected. Fonts may not be loaded correctly.' );
						}
					}
				}
			}

			let disposable = vscode.commands.registerCommand('latex-preview.preview', () => {
				const editor = vscode.window.activeTextEditor;
				if (editor)	{
					DocumentPanel.documentPathUri = vscode.Uri.file(path.dirname(editor.document.fileName));
					const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('latexPreview');
					const dpi: number = config?.get('dpi') ?? 96;
					const pageSize: string = config?.get('pageSize') ?? "A4";
					const mag: number = config?.get('mag') ?? 100;		
					const debugMode: boolean = config?.get('debugMode') ?? false;				
					const pageBufferSize: number =  config?.get('pageBufferSize') ?? 2;				
					DocumentPanel.createOrShow(
						context.extensionUri, editor, fontMap, fontCachePath, dpi, pageSize, mag,
						pageBufferSize, debugMode, outputChannel, previewStatusBarItem);
					if (DocumentPanel.currentPanel) {
						DocumentPanel.currentPanel.generateDocument(editor);
					}
				}
			});
			context.subscriptions.push(disposable);			

			disposable = vscode.commands.registerCommand('latex-preview.generatePdf', () => {
				if (vscode.window.activeTextEditor?.document?.fileName) {
					const editor = vscode.window.activeTextEditor;
					const ext: string = path.extname(editor.document.fileName);
					if (ext === '.tex' || ext === '.latex') {
						generatePdf(editor.document.fileName, outputChannel);
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
					DocumentPanel.currentPanel.generateDocument(vscode.window.activeTextEditor);
				}
			});
			context.subscriptions.push(disposable);

			disposable = vscode.commands.registerCommand('latex-preview.setPageSize', async () => {
				if (DocumentPanel.currentPanel?.editor) {
					const pageSize = await vscode.window.showQuickPick(["A5", "A4", "A3", "US Letter"],
						{ title: "Select a page size...", ignoreFocusOut: true, canPickMany: false});
					if (pageSize) {
						DocumentPanel.currentPanel.pageSize = pageSize;
						DocumentPanel.currentPanel.pageSizeChanged(pageSize);
						DocumentPanel.currentPanel.generateDocument(DocumentPanel.currentPanel.editor);
					}
				}
			});
			context.subscriptions.push(disposable);				

			disposable = vscode.commands.registerCommand('latex-preview.magIncrease', () => {
				if (DocumentPanel.currentPanel?.editor) {
					DocumentPanel.currentPanel.mag += 10;
					DocumentPanel.currentPanel.pageWidthPixels = Math.floor(DocumentPanel.currentPanel.pageWidthPixels * 1.1);
					DocumentPanel.currentPanel.pageHeightPixels = Math.floor(DocumentPanel.currentPanel.pageHeightPixels * 1.1);
					DocumentPanel.currentPanel.marginPixels = Math.floor(DocumentPanel.currentPanel.marginPixels * 1.1);			
					DocumentPanel.currentPanel.generateDocument(DocumentPanel.currentPanel.editor);
				}
			});
			context.subscriptions.push(disposable);		
		
			disposable = vscode.commands.registerCommand('latex-preview.magDecrease', () => {
				if (DocumentPanel.currentPanel?.editor) {
					DocumentPanel.currentPanel.mag -= 10;
					DocumentPanel.currentPanel.pageWidthPixels = Math.floor(DocumentPanel.currentPanel.pageWidthPixels * 0.9);
					DocumentPanel.currentPanel.pageHeightPixels = Math.floor(DocumentPanel.currentPanel.pageHeightPixels * 0.9);
					DocumentPanel.currentPanel.marginPixels = Math.floor(DocumentPanel.currentPanel.marginPixels * 0.9);
					DocumentPanel.currentPanel.generateDocument(DocumentPanel.currentPanel.editor);
				}
			});
			context.subscriptions.push(disposable);		
		
			disposable = vscode.commands.registerCommand('latex-preview.magLabelPlaceholder', () => {
				/* no action - used as a tile bar label */
			});
			context.subscriptions.push(disposable);		
		
		}			
	}
};

module.exports.deactivate = () => {
	outputChannel.dispose();
};
