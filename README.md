# LaTeX Preview

LaTeX Preview is a VS Code extension that generates a typeset document from your LaTeX source and renders it directly to the canvas of a VS Code window.

![image](./media/lp.gif)

## Features

* Renders from a generated DVI file - no PDF output required.
* Pages are rendered as needed for faster previewing.
* Glyph bitmaps are cached to improve rendering speed.
* Configurable screen DPI for better rendering accuracy.
* Forward and reverse document synchronization.
* Supports rendering of images in SVG format.
* Re-rendering on save

## Prerequisites

* VS Code or VSCodium >= v1.75
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

## Getting Started

1. Search for LaTeX Preview in VS Code Extensions and click Install
2. Go to the extension settings and set the LaTeX font diretory for your LaTeX distribution
3. Open a LaTeX file and run LaTeX Preview: Show Preview from the Command Palette or click the Preview icon

## No preview showing?

* Check the output log for error messages
* Set Debug Mode for detailed logs
* There may be fonts, images or LaTeX packages that were not found
* Depending on your LaTeX distribution you may or may not be prompted to install packages
* Install all required fonts and packages and try again

## Possible future enhancements

* Printing
* Saving of decoded DVI data in JSON format to enable document distribution for the web
* A NodeJS module for rendering JSON document files to a browser canvas
