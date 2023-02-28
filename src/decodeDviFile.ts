import { readFile } from 'node:fs/promises';
import { dviDecode } from '@matjp/dvi-decode';

export async function decodeDviFile(
    dviFileName: string, fontMap: Map<string, string>, dpi: number, mag: number, debugMode: boolean, log: (msg: string) => void
): Promise<string> {
    return new Promise( async (resolve, reject) => {
        try {
            const dviData = await readFile(dviFileName);
            try {
                const doc = await dviDecode(dviData, dpi, mag * 10, fontMap, debugMode, log);
                resolve(doc);
            } catch (err) {
                reject(err);
            }
        } catch (err) {
            reject(err);
        }
    });
}