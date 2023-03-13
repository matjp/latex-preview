(function () {
    let marginPixels;
    let pageWidth;
    let pageHeight;
    let glyphBitmaps = [];
    let renderComplete = false;
    let scrollTimeoutId;
    const vscode = acquireVsCodeApi();
    if (!vscode) {
        console.log('Error: vscode api not found');
    }

    window.addEventListener('message', event => {
        switch (event.data.type) {
            case 'initCanvas': {
                initCanvas(event.data.value);
                break;
            }
            case 'resetGlyphBitmaps': {
                glyphBitmaps = [];
                break;
            }
            case 'renderPage': {
                renderPage(event.data.value);
                break;
            }
            case 'scroll': {
                scrollTimeoutId = Number.MAX_SAFE_INTEGER;
                scrollDocument(event.data.value);
                break;
            }
            case 'drawbox': {
                drawBox(event.data.value);
                break;
            }
        }
    });

    const scrollListener = (event) => {
        if (scrollTimeoutId) {
            scrollTimeoutId = undefined;
            return;
        }
        scrollTimeoutId = setTimeout(() => { sendScrollMessage(); }, 200);
        function sendScrollMessage() {
            clearTimeout(scrollTimeoutId);
            scrollTimeoutId = undefined;
            vscode.postMessage({
                command: 'webviewScrolled',
                scrollY: window.scrollY
            });
        }  
    };

    window.addEventListener("scroll", scrollListener);

    function initCanvas(pageMetrics) {
        const cnv = document.getElementById('cnv');
        if (cnv) {
            marginPixels = pageMetrics.marginPixels;
            pageWidth = pageMetrics.pageWidth;
            pageHeight = pageMetrics.pageHeight;       
            cnv.width = pageWidth;
            cnv.height = pageMetrics.pageCount * pageHeight;
        }
        renderComplete = false;
    }

    function renderPage(pageData) {
        const pageIndex = pageData.pageIndex;
        const pageSource = pageData.pageSource;
        const pageGlyphs = pageData.pageGlyphs;
        const cnv = document.getElementById('cnv');
        const ctx = cnv ? cnv.getContext('2d', { alpha: false }) : undefined;
        if (pageSource && cnv && ctx) {
            const osPageCanvas = new OffscreenCanvas(pageWidth, pageHeight);                
            const osPageCtx = osPageCanvas.getContext('2d');
            if (osPageCtx) {
                osPageCtx.fillStyle = 'white';
                osPageCtx.fillRect(0, 0, pageWidth, pageHeight);
                osPageCtx.fillStyle = 'black';
       
                const imagePromises = pageSource.images.map(async image => {
                    let img = new Image();
                    img.src = documentPath + '/' + image.fileName.replace('.eps','.svg');
                    try {
                        await img.decode();
                        osPageCtx.drawImage(img, marginPixels + image.x, marginPixels + image.y, image.w, image.h);
                    } catch(err) {
                        console.log(err);
                    }
                });
  
                Promise.all(imagePromises).then(() => {
                    pageSource.rules.forEach(rule =>
                        osPageCtx.fillRect(marginPixels + rule.x, marginPixels + rule.y, rule.w, rule.h)
                    );               
    
                    const osGlyphCanvas = new OffscreenCanvas(1,1); 
                    const osGlyphCtx = osGlyphCanvas.getContext('2d');            
                    pageGlyphs.forEach(glyph => {
                        if (!glyphBitmaps[glyph.glyphPath.fontNum]) {
                            glyphBitmaps[glyph.glyphPath.fontNum] = [];
                        }
                        if (!glyphBitmaps[glyph.glyphPath.fontNum][glyph.glyphPath.glyphIndex]) {
                            glyphBitmaps[glyph.glyphPath.fontNum][glyph.glyphPath.glyphIndex] = [];
                        }
                        let glyphBitmap = glyphBitmaps[glyph.glyphPath.fontNum][glyph.glyphPath.glyphIndex][glyph.glyphPath.size];
                        if (!glyphBitmap && glyph.glyphPath) {
                            osGlyphCanvas.width = glyph.glyphPath.width;
                            osGlyphCanvas.height = glyph.glyphPath.height;
                            let path2D = new Path2D(glyph.glyphPath.path);
                            osGlyphCtx.fill(path2D);
                            glyphBitmap = osGlyphCanvas.transferToImageBitmap();
                            glyphBitmaps[glyph.glyphPath.fontNum][glyph.glyphPath.glyphIndex][glyph.glyphPath.size] = glyphBitmap;
                        }
                        if (glyphBitmap) {
                            osPageCtx.drawImage(glyphBitmap, marginPixels + glyph.x, marginPixels + glyph.y);
                        }
                    });

                    const pageBitmap = osPageCanvas.transferToImageBitmap();
                    ctx.drawImage(pageBitmap, 0, pageIndex * pageHeight);
                    vscode.postMessage({
                        command: 'pageRendered',
                        pageIndex: pageIndex
                    });                
                    renderComplete = true;            
                });
            }           
        }
    }

    function scrollDocument(scrollData) {
        window.scrollTo(0, scrollData.vPos);
    }

    function drawBox(boxData) {
        const timeoutId = setTimeout(() => { if (renderComplete) { resumeDraw(); } }, 100);
        function resumeDraw() {
            clearTimeout(timeoutId);
            const cnv = document.getElementById('cnv');
            const ctx = cnv ? cnv.getContext('2d', { alpha: false }) : undefined;
            if (ctx) {
                ctx.translate(.5,.5);
                ctx.lineWidth = 1;
                ctx.strokeStyle = boxData.color;
                ctx.strokeRect(boxData.x, boxData.y, boxData.w, boxData.h);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            }
        }
    }
}());