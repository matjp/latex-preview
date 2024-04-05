import * as vscode from 'vscode';
import path from 'node:path';
import fs from 'node:fs';
import util from 'util';
import TelemetryReporter from '@vscode/extension-telemetry';

export async function generatePdf(srcFile: string, outputChannel: vscode.OutputChannel, reporter: TelemetryReporter) {
	outputChannel.clear();
	outputChannel.show();
	const docPath = path.dirname(srcFile);
	const ext = path.extname(srcFile);			
	const pdfFileName = srcFile.replace(ext, '.pdf');
	if (fs.existsSync(pdfFileName)) {
		fs.rmSync(pdfFileName);
	}
	try {
		const exec = util.promisify(require('child_process').exec);
		const cmd = 'lualatex --halt-on-error --interaction=nonstopmode ' + srcFile;
		outputChannel.appendLine(cmd);			
		const { stdout, stderr } = await exec(cmd, { cwd: docPath });
    	outputChannel.appendLine(stdout);
		if (stderr) {
			outputChannel.appendLine(stderr);			
		}
		outputChannel.appendLine('Done.');
		const pdfFileLink = vscode.Uri.file(pdfFileName);
		outputChannel.appendLine('PDF written to ' + pdfFileLink);
	} catch (err: any) {
		if (err.stdout) {
			outputChannel.appendLine(err.stdout.toString());
		}
		outputChannel.appendLine(String(err));
		outputChannel.appendLine('Could not generate pdf file - review the log for errors.');
		reporter.sendTelemetryErrorEvent('error(generatePdf)', { 'errorString': String(err) });
	}
}

