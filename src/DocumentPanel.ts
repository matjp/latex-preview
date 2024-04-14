import * as vscode from 'vscode';
import path from 'node:path';
import fs, { constants } from 'node:fs';
import fsPromises from 'node:fs/promises';
import util from 'util';
import { decodeDviFile } from './decodeDviFile';
import { SyncTex, parseSyncTex, SyncTexBlock } from './synctexParser';
import { load, Font } from 'opentype.js';
import { GlyphPath, getGlyphPaths } from './glyphPaths';
import throttle from 'lodash/throttle';
import TelemetryReporter from '@vscode/extension-telemetry';

type PageDimensions = {
	pageWidth: number,
	pageHeight: number
};

const pageSizeMap = new Map<string, PageDimensions>([
	["A3", { pageWidth: 297, pageHeight: 420 }],	
	["A4", { pageWidth: 210, pageHeight: 297 }],
	["A5", { pageWidth: 148, pageHeight: 210 }],	
	["US Letter", { pageWidth: 216, pageHeight: 279 }],
	["US Legal", { pageWidth: 216, pageHeight: 356 }]
]);

const mmToInchConv = 0.039370079;

export class DocumentPanel {
	/* Track the current panel. Only allow a single panel to exist at a time. */
	public static currentPanel: DocumentPanel | undefined;
	public static readonly viewType = 'latexPreview';
	public editor: vscode.TextEditor;	
	public static documentPathUri: vscode.Uri | undefined;
	public dpi: number;
	public mag: number;
	public pageSize: string;	
	public pageWidthPixels: number;
	public pageHeightPixels: number;
	public marginPixels: number;
	public pageBufferSize: number;
	public pageGap: number;
	public debugMode: boolean;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _outputChannel: vscode.OutputChannel;
	private readonly _previewStatusBarItem: vscode.StatusBarItem;
	private readonly _fontMap: Map<string, string>;
	private readonly _fontCachePath: string;
	private _synctex: SyncTex | undefined;
	private _synctexBlocksYSorted: SyncTexBlock[] | undefined;
	private _documentSource: any;
	private _documentFonts: Font[];
	private _glyphPaths: GlyphPath[];
	private _documentGlyphs: any[];
	private _renderPages: number[];	
	private _renderedPages: number[];
	private _renderingPage: boolean[];
	private _webviewScrollYPos: number;
	private _currentPageNo: number;
	private _scrollLock: boolean;
	private _disposables: vscode.Disposable[] = [];

	private _resetPrivateVars() {
		this. _synctex = undefined;
		this._synctexBlocksYSorted = undefined;
		this._documentSource = {};
		this._documentFonts = [];
		this._documentGlyphs = [];
		this._renderPages = [];	
		this._renderedPages = [];
		this._renderingPage = [];
		this._webviewScrollYPos = 0;
		this._currentPageNo = 1;
		this._scrollLock = false;
	};

	public static createOrShow(
		extensionUri: vscode.Uri,
		editor: vscode.TextEditor,
		fontMap: Map<string, string>,
		fontCachePath: string,
		dpi: number,
		pageSize: string,
		mag: number,
		pageBufferSize: number,
		pageGap: number,
		debugMode: boolean,
		outputChannel: vscode.OutputChannel) {

		// If we already have a panel, show it.
		if (DocumentPanel.currentPanel) {
			DocumentPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
			DocumentPanel.currentPanel.pageBufferSize = pageBufferSize;
			DocumentPanel.currentPanel.pageGap = pageGap;
			DocumentPanel.currentPanel.debugMode = debugMode;
			DocumentPanel.currentPanel.dpi = dpi;
			DocumentPanel.currentPanel.mag = mag;
			DocumentPanel.currentPanel.marginPixels = Math.floor(dpi * (mag / 100));
			DocumentPanel.currentPanel._setPageDimensions();			
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			DocumentPanel.viewType,
			'LaTeX Preview',
			vscode.ViewColumn.Beside,
			getWebviewOptions(extensionUri)
		);

		DocumentPanel.currentPanel = new DocumentPanel(
			panel, extensionUri, editor, fontMap, fontCachePath, dpi, pageSize, mag,
			pageBufferSize, pageGap, debugMode, outputChannel);
	}

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		editor: vscode.TextEditor,
		fontMap: Map<string, string>,
		fontCachePath: string,
		dpi: number,
		pageSize: string,
		mag: number,
		pageBufferSize: number,
		pageGap: number,
		debugMode: boolean,
		outputChannel: vscode.OutputChannel) {
		this._panel = panel;
		this.editor = editor;
		this._extensionUri = extensionUri;
		this._previewStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this._fontMap = fontMap;
		this._fontCachePath = fontCachePath;
		this.pageBufferSize = pageBufferSize;
		this.pageGap = pageGap;
		this.debugMode = debugMode;
		this.dpi = dpi;
		this.mag = mag;
		this.pageSize = pageSize;
		this.marginPixels = Math.floor(dpi * (mag / 100));
		const pageDimensions = pageSizeMap.get(pageSize);
		if (pageDimensions) {
			this.pageWidthPixels = Math.floor(pageDimensions.pageWidth * mmToInchConv * dpi * (mag / 100));
			this.pageHeightPixels = Math.floor(pageDimensions.pageHeight * mmToInchConv * dpi * (mag / 100));
		} else {
			this.pageWidthPixels = Math.floor(210 * mmToInchConv * dpi * (mag / 100));
			this.pageHeightPixels = Math.floor(297 * mmToInchConv * dpi * (mag / 100));
		}
		this. _synctex = undefined;
		this._synctexBlocksYSorted = undefined;
		this._documentSource = {};
		this._documentFonts = [];
		this._glyphPaths = [];
		this._documentGlyphs = [];
		this._renderPages = [];	
		this._renderedPages = [];
		this._renderingPage = [];
		this._webviewScrollYPos = 0;
		this._currentPageNo = 1;
		this._scrollLock = false;
		this._outputChannel = outputChannel;
		this._outputChannel.show(true);

		// Set the webview's initial html content
		this._update();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.onDidChangeViewState(
			e => {
				if (e.webviewPanel.active) {
					this._previewStatusBarItem.show();
				} else {
					this._previewStatusBarItem.hide();
				}
			},
			null,
			this._disposables
		);

		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'webviewScrolled':
						this._webviewScrolled(message.scrollY);
						return;
					case 'pageRendered':
						this._renderedPages.push(message.pageIndex);
						this._renderingPage[message.pageIndex] = false;
						const pageIndex = this._renderPages.pop();
						if (pageIndex) {
							this._renderPage(pageIndex);
						}
						return;
				}
			},
			null,
			this._disposables
		);
	}

	private _updateStatus() {
		if (this._documentSource?.pages) {
			this._previewStatusBarItem.text =
				`Page ${this._currentPageNo}/${this._documentSource.pages.length} Size: ${this.pageSize} Mag: ${this.mag}% DPI: ${this.dpi}`;
		}
	}

	public pageSizeChanged() {
		this._setPageDimensions();
	}

	public magnificationChanged() {
		this._setPageDimensions();
	}

	private _setPageDimensions() {		
		this.marginPixels = Math.floor(this.dpi * (this.mag / 100));
		const pageDimensions = pageSizeMap.get(this.pageSize);
		if (pageDimensions) {
			this.pageWidthPixels = Math.floor(pageDimensions.pageWidth * mmToInchConv * this.dpi * (this.mag / 100));
			this.pageHeightPixels = Math.floor(pageDimensions.pageHeight * mmToInchConv * this.dpi * (this.mag / 100));
		} else {
			this.pageWidthPixels = Math.floor(210 * mmToInchConv * this.dpi * (this.mag / 100));
			this.pageHeightPixels = Math.floor(297 * mmToInchConv * this.dpi * (this.mag / 100));
		}
	}

	public async generateDocument(editor: vscode.TextEditor, reporter: TelemetryReporter) {
		this._outputChannel.clear();
		this._resetPrivateVars();		
		if (editor.document.fileName !== this.editor.document.fileName) {
			this._resetGlyphBitmaps();
		}
		this.editor = editor;
		const docPath = path.dirname(this.editor.document.fileName);
		const ext = path.extname(editor.document.fileName);		
		const dviFileName = this.editor.document.fileName.replace(ext, '.dvi');
		if (fs.existsSync(dviFileName)) {
			fs.rmSync(dviFileName);
		}
		try {
			if (this.debugMode) {
				this._outputChannel.appendLine('Fonts found on this system:');
				this._fontMap.forEach((value, key) => {
					this._outputChannel.appendLine(value + '/' + key);
				  });
			}			
			const exec = util.promisify(require('child_process').exec);
			const cmd = 'dvilualatex --halt-on-error --interaction=nonstopmode --synctex=-1 ' + this.editor.document.fileName;
			this._outputChannel.appendLine(cmd);			
			const { stdout, stderr } = await exec(cmd, { cwd: docPath });
			if (this.debugMode) {
				this._outputChannel.appendLine(stdout);
			}
			if (stderr) {
				this._outputChannel.appendLine(stderr);			
			}
			this._parseSyncTexFile(dviFileName.replace('.dvi', '.synctex'));
			this._outputChannel.appendLine('Decoding dvi file ' + dviFileName + ' ...');
			const json = await decodeDviFile(dviFileName, this._fontMap, this.dpi, this.mag, this.debugMode, this._outputChannel.appendLine);
			this._documentSource = JSON.parse(json);
			this._outputChannel.appendLine('Loading fonts ...');
			await this._loadFonts();
			this._outputChannel.appendLine('Rendering preview...');
			this._update();
			this._panel.webview.options = getWebviewOptions(this._extensionUri);
			this._initCanvas();
			for (let i = 0; i < this._documentSource.pages.length; i++) {
				this._renderingPage.push(false);
			}
			this._renderPagesFrom(0, 1);
			this._updateStatus();
		} catch (err: any) {
			if (err.stdout) {
				this._outputChannel.appendLine(err.stdout.toString());
			}
			this._outputChannel.appendLine(String(err));
			this._outputChannel.appendLine('Could not generate dvi file - review the log for errors.');
			reporter?.sendTelemetryErrorEvent('error(generateDocument)', { 'errorString': String(err) });
			this.dispose();
		}
	}

	private async _loadFonts(): Promise<any[]> {
		const fontPromises = this._documentSource?.fonts?.map(async (font: any) => {
			try { /* update the font cache */
				const src = path.join(font.fontPath, font.fontName);
				const dst = path.join(this._fontCachePath, font.fontName);
				await fsPromises.copyFile(src, dst, constants.COPYFILE_EXCL);
			} catch (err: any) {
				if (err.code !== 'EEXIST') {
					this._outputChannel.appendLine(String(err));
				}
			}
			try { /* load the opentype.js Font objects */
				const otfFont = await load(this._fontCachePath + '/' + font.fontName);
				this._documentFonts[font.fontNum] = otfFont;
			} catch (err: any) {
				this._outputChannel.appendLine(String(err));
			}
		});

		return Promise.all(fontPromises);
	}

	private _parseSyncTexFile(synctexFileName: string) {
		if (fs.existsSync(synctexFileName)) {
			this._outputChannel.appendLine('Parsing synctex file ' + synctexFileName + ' ...');
			const syncBody = fs.readFileSync(synctexFileName, { encoding: 'utf8' });
			if (syncBody && this.editor.document.fileName) {
				try {
					const parsedSyncTex = parseSyncTex(syncBody, this.editor.document.fileName, this.dpi, this.mag);
					this._synctex = parsedSyncTex;
					this._synctex?.blocks.sort(({ lineNumber: a }, { lineNumber: b }) => a - b);
					this._synctexBlocksYSorted = [...this._synctex?.blocks].sort(
						({ page: p1, bottom: b1 }, { page: p2, bottom: b2 }) => (
							(p1 * (this.pageHeightPixels + this.pageGap)) + b1) - ((p2 * (this.pageHeightPixels + this.pageGap)) + b2
						)
					);
				} catch (err) {
					this._outputChannel.appendLine(String(err));
				}
			}
		} else {
			this._outputChannel.appendLine('WARNING: No synctex file found. Scroll synchronization will be unavailable.');
		}
	}

	private _initCanvas() {
		this._panel.webview.postMessage({
			type: 'initCanvas', value: {
				pageCount: this._documentSource.pages.length,
				marginPixels: this.marginPixels,
				pageWidth: this.pageWidthPixels,
				pageHeight: this.pageHeightPixels,
				pageGap: this.pageGap
			}
		});
	}

	private _resetGlyphBitmaps() {
		this._panel.webview.postMessage({
			type: 'resetGlyphBitmaps', value: {}
		});
	}

	private _renderPagesFrom(pageIndex: number, direction: number) {
		let pageCount = this.pageBufferSize;
		let nextPageIndex: number | undefined;
		do {
			nextPageIndex = (pageIndex + (pageCount * direction));
			if (!this._renderPages.includes(nextPageIndex) && this._renderingPage[nextPageIndex] === false && !this._renderedPages.includes(nextPageIndex)) {
				this._renderPages.push(nextPageIndex);
			}
			pageCount--;
		} while (pageCount > 0);
		if (this._renderingPage[pageIndex] === false && !this._renderedPages.includes(pageIndex)) {
			this._renderPage(pageIndex);
		} else {
			nextPageIndex = this._renderPages.pop();
			if (nextPageIndex) {
				this._renderPage(nextPageIndex);
			}
		}

	}

	private _renderPage(pageIndex: number) {
		if (pageIndex >= 0 && pageIndex < this._documentSource.pages.length && this._renderingPage[pageIndex] === false && !this._renderedPages.includes(pageIndex)) {
			try {
				this._renderingPage[pageIndex] = true;
				const glyphData = getGlyphPaths(
					this._documentSource.pages[pageIndex], this._documentFonts, this._glyphPaths
				);
				this._glyphPaths = glyphData.glyphPaths;
				this._documentGlyphs[pageIndex] = glyphData.pageGlyphs;
				this._panel.webview.postMessage(
					{
						type: 'renderPage',
						value: {
							pageIndex: pageIndex,
							pageSource: this._documentSource.pages[pageIndex],
							pageGlyphs: this._documentGlyphs[pageIndex]
						}
					}
				);
			} catch (err) {
				this._outputChannel.appendLine(String(err));
				this._renderingPage[pageIndex] = false;
			}
		}
	}

	private _getScrollDirection(vPos: number) {
		return this._webviewScrollYPos < vPos ? 1 : this._webviewScrollYPos > vPos ? -1 : 0;
	}

	public scrollDocument = throttle((lineNo: number) => {
		if (this._scrollLock) {
			this._scrollLock = false;
			return;
		}
		if (lineNo <= 1) {
			this._panel.webview.postMessage({ type: 'scroll', value: { vpos: 0 } });
			return;
		}
		const xOffset = this._synctex?.offset.x || this.dpi;
		const yOffset = this._synctex?.offset.y || this.dpi;
		let minX = Number.MAX_SAFE_INTEGER;			
		let maxY = 0;
		let currentPageIndex = 0;
		let pageIndex = 0;
		let pageTop = 0;
		let hBlocks = this._synctex?.blocks.filter(({ type, lineNumber }) => type === 'h' && lineNumber === lineNo);
		if (hBlocks && hBlocks.length > 0) {
			let leftmostBlock: SyncTexBlock | undefined;
			let bottomBlock: SyncTexBlock | undefined;
			hBlocks.forEach((block: SyncTexBlock) => {
				const w = block.width;
				const h = block.height;
				if (h > 0 && w > 0) {
					if (block.left < minX) {
						minX = block.left;
						leftmostBlock = block;
					}
					if (currentPageIndex !== block.page - 1) {
						currentPageIndex = block.page - 1;
					}
					pageTop = currentPageIndex * (this.pageHeightPixels + this.pageGap);
					const y = yOffset + pageTop + block.bottom;
					if (y > maxY) {
						maxY = y;
						bottomBlock = block;
					}
				}
			});
			const scrollBlock = (bottomBlock?.left === leftmostBlock?.left) ? bottomBlock : leftmostBlock;
			if (scrollBlock) {
				const vPos = yOffset + pageTop + (scrollBlock.bottom - scrollBlock.height);
				pageIndex = Math.floor(vPos / (this.pageHeightPixels + this.pageGap));
				this._renderPagesFrom(pageIndex, this._getScrollDirection(vPos));
				this._panel.webview.postMessage({ type: 'scroll', value: { vPos: vPos } });
			}
		} else { /* no h-blocks (could be a broken up long line) - look for glue elements instead */
			const glueElements = this._synctex?.blocks.filter(({ type, lineNumber }) => type === 'g' && lineNumber === lineNo);
			if (glueElements && glueElements.length > 0) {
				const glueElement = glueElements[1];
				if (glueElement) {
					if (currentPageIndex !== glueElement.page - 1) {
						currentPageIndex = glueElement.page - 1;
					}
					pageTop = currentPageIndex * (this.pageHeightPixels + this.pageGap);
					const vPos = yOffset + pageTop + (glueElement.bottom - 15);
					pageIndex = Math.floor(vPos / (this.pageHeightPixels + this.pageGap));
					this._renderPagesFrom(pageIndex, this._getScrollDirection(vPos));
					this._panel.webview.postMessage({ type: 'scroll', value: { vPos: vPos } });
				}
			}
		}
	}, 50);

	private _webviewScrolled(scrollY: number) {
		if (scrollY === this._webviewScrollYPos) {
			return;
		}
		const pageIndex = Math.floor(scrollY / (this.pageHeightPixels + this.pageGap));
		this._currentPageNo = pageIndex + 1;
		this._updateStatus();
		this._renderPagesFrom(pageIndex, this._getScrollDirection(scrollY));
		const lineNumber = this._lineFromScrollPos(scrollY);
		if (lineNumber) {
			const revealRange = this._toRevealRange(lineNumber, this.editor);
			this._scrollLock = true;
			this.editor.revealRange(revealRange, vscode.TextEditorRevealType.AtTop);
		}
		this._webviewScrollYPos = scrollY;
	}

	private _lineFromScrollPos(scrollY: number): number | undefined {
		const yOffset = this._synctex?.offset.y || this.dpi;
		const pageIndex = Math.floor(scrollY / (this.pageHeightPixels + this.pageGap));
		const pageTop = (pageIndex * (this.pageHeightPixels + this.pageGap));
		let y = scrollY - (pageTop + yOffset);
		let lineIndex: number;
		if (this._synctexBlocksYSorted) {
			do {
				lineIndex = this._synctexBlocksYSorted.findIndex(({ page, bottom }) => page === pageIndex + 1 && bottom === y);
				y--;
			} while (lineIndex === -1 && y >= 0);
			if (lineIndex >= 0) {
				return this._synctexBlocksYSorted[lineIndex].lineNumber;
			}
		}
	}

	private _toRevealRange(line: number, editor: vscode.TextEditor): vscode.Range {
		if (line >= editor.document.lineCount) {
			return new vscode.Range(editor.document.lineCount - 1, 0, editor.document.lineCount - 1, 0);
		}
		return new vscode.Range(line, 0, line + 1, 0);
	}

	public getTopmostLine(editor: vscode.TextEditor): number | undefined {
		if (!editor.visibleRanges.length) {
			return undefined;
		}
		const firstVisiblePosition = editor.visibleRanges[0].start;
		return firstVisiblePosition.line + 1;
	}

	public dispose() {
		DocumentPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;
		webview.html = this._getHtmlForWebview(webview);
		return;
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const webviewScriptPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webviewFunctions.js');
		const webviewScriptUri = webview.asWebviewUri(webviewScriptPath);

		const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'reset.css');
		const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'vscode.css');

		const documentPath = DocumentPanel.documentPathUri ? webview.asWebviewUri(DocumentPanel.documentPathUri) : '';

		const stylesResetUri = webview.asWebviewUri(styleResetPath);
		const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);

		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();

		const init = `const documentPath = '${documentPath}';`;

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${webview.cspSource}; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">				
				<link href="${stylesResetUri}" rel="stylesheet">
				<link href="${stylesMainUri}" rel="stylesheet">			
				<title>LaTeX Preview</title>
			</head>
			<body>
				<div class="menu" data-vscode-context='{"webviewSection": "menu", "preventDefaultContextMenuItems": true}'>
				<canvas id="cnv" height="10000" width="780"></canvas>
				</div>
				<script nonce="${nonce}">${init}</script>
				<script nonce="${nonce}" src="${webviewScriptUri}"></script>
			</body>
			</html>`;
	}

	public async exportDocument(reporter: TelemetryReporter) {
		this._outputChannel.clear();
		this._outputChannel.show();
		const srcFile = this.editor.document.fileName;
		const docPath = path.dirname(srcFile);
		const ext = path.extname(srcFile);			
		const jsonFileName = srcFile.replace(ext, '.json');
		if (fs.existsSync(jsonFileName)) {
			fs.rmSync(jsonFileName);
		}
		try {
			const json = JSON.stringify(this._documentSource, null, 4);
			fsPromises.writeFile(jsonFileName, json);
			const jsonFileLink = vscode.Uri.file(jsonFileName);
			this._outputChannel.appendLine('Document JSON written to ' + jsonFileLink);
		} catch (err: any) {
			this._outputChannel.appendLine(String(err));
			this._outputChannel.appendLine('Failed to write JSON file.');
			reporter?.sendTelemetryErrorEvent('error(exportDocument)', { 'errorString': String(err) });
		}		
	}
}

export function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	let paths = [
		vscode.Uri.joinPath(extensionUri, 'out')
	];

	if (DocumentPanel && DocumentPanel.documentPathUri) {
		paths.push(DocumentPanel.documentPathUri);
	}

	return {
		enableScripts: true,
		localResourceRoots: paths
	};
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
