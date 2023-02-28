# LaTeX Preview

LaTeX Preview is a VS Code extension that generates a typeset document from your LaTeX source and renders it directly to the canvas of a VS Code window.

![image](./media/lp.gif)

## Features

* Renders directly from DVI - no PDF generation required.
* Pages are rendered as needed for faster previewing.
* Glyph bitmaps are cached to improve rendering speed.
* Configurable screen DPI for better rendering accuracy.
* Forward and reverse document synchronization.
* Supports rendering of images in SVG format.
* Re-rendering on save

## Prerequisites

* VS Code >= v1.75
* A TeX distribution that includes LuaTeX
* luaotfload package >= v3.23
* OpenType or TrueType fonts for all fonts used in your documents

## Configuration Options

* DPI: Display device resolution in pixels per inch. Default 96
* Page Width: Page width in inches. Default 8.27 (A4)
* Page Height: Page height in inches. Default 11.69 (A4)
* Magnification: Document magnification(%). Default 100.
* Page Buffer Size: Number of pages to pre-render. Default 2
* LaTeX Font Dir: Path to the font directory of your LaTeX distribution. Required
* Debug Mode: Print debug messages? Default false
