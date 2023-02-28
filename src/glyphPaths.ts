import { Font } from 'opentype.js';

export type GlyphPath = {
    fontNum: number;
    glyphIndex: number;
    size: number;
    path: string,
    width: number,
    height: number
};

export type PageGlyph = {
    glyphPath: GlyphPath | undefined,
    x: number,
    y: number
};

export function getGlyphPaths(pageSource: any, documentFonts: Font[], glyphPaths: GlyphPath[]): any {
    let pageGlyphs: PageGlyph[] = [];
    pageSource.pageFonts.forEach((pageFont: any) => {
        const otfFont = documentFonts[pageFont.fontNum];
        if (otfFont) {
            pageFont.glyphs.forEach((glyph: any) => {
                let otfGlyph = otfFont.glyphs.get(glyph.glyphIndex);
                if (otfGlyph) {
                    glyph.glyphSizes.forEach((glyphSize: any) => {
                        const bb = otfGlyph.getBoundingBox();
                        const conv = glyphSize.sz / (otfFont.unitsPerEm || 1000); /* px per unit */
                        const glyphXOrigin = Math.floor((otfGlyph.leftSideBearing || 0) * conv);
                        const glyphBaseLine = Math.ceil(bb.y2 * conv);
                        let glyphPath = glyphPaths.find(({ fontNum, glyphIndex, size }) => {
                            fontNum === pageFont.fontNum && glyphIndex === glyph.glyphIndex && size === glyphSize.sz;
                        });
                        if (!glyphPath) {
                            const path = otfGlyph.getPath(-glyphXOrigin, glyphBaseLine, glyphSize.sz, { features: {hinting: true} }, otfFont);
                            const pathStr = path.toPathData(2);
                            if (pathStr.length > 0) {
                                glyphPath = {
                                    fontNum: pageFont.fontNum,
                                    glyphIndex: glyph.glyphIndex,
                                    size: glyphSize.sz,                                
                                    path: pathStr,
                                    width: Math.ceil(bb.x2 * conv) - Math.floor(bb.x1 * conv),
                                    height: Math.ceil(bb.y2 * conv) - Math.floor(bb.y1 * conv)
                                };
                                glyphPaths.push(glyphPath);
                            }
                        }                
                        if (glyphPath) {                                    
                            glyphSize.glyphPlacements.forEach((glyphPlacement: any) => {
                                pageGlyphs.push({
                                    glyphPath: glyphPath,
                                    x: glyphPlacement.x + glyphXOrigin,
                                    y: glyphPlacement.y - glyphBaseLine
                                });
                            });
                        }
                    });
                }
            });
        }
    });

    return { pageGlyphs: pageGlyphs, glyphPaths: glyphPaths };
}
