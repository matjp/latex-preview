# LaTeX Previewer

LaTeX Previewer is a VS Code extension that generates a typeset document from your LaTeX source and renders it directly to the canvas of a VS Code webview.

![image](./media/lp.gif)

Note: LaTeX Previewer works with LuaLaTeX compatible source files. If you are currently using another LaTeX engine you may need to modify your source code to make it LuaLaTeX compatible. A good starting point for those new to LuaLaTeX is [A Guide to LuaLaTeX](http://tug.ctan.org/info/luatex/lualatex-doc/lualatex-doc.pdf).

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

## Getting Started

1. Search for LaTeX Previewer in VS Code Extensions or Open VSX and click Install
2. Go to the extension settings and set the LaTeX font diretory for your LaTeX distribution e.g. for MiKTeX on Windows C:\Users\<username>\AppData\Local\Programs\MiKTeX\fonts or for TeXLive native on Linux /usr/share/texmf/fonts
3. The system font path will also be searched for font files
4. Open a LaTeX file and run LaTeX Preview: Show Preview from the Command Palette or click the Preview icon

## Configuration Options

* DPI: Display device resolution in pixels per inch. Default 96
* Page Size: Default A4
* Magnification: Document magnification(%). Default 100
* Page Buffer Size: Number of pages to pre-render. Default 2
* LaTeX Font Dir: Path to the font directory of your LaTeX distribution. Required
* Debug Mode: Print debug messages? Default false

## Commands

* Show Preview (Ctrl+Shift+L): Opens the Preview window, compiles your document, and renders it
* Set Page Size: Choose from a list of page sizes. Recompiles after selection
* Set Magnification: Enter a new magnification percentage. Recompiles after entry
* Magnification +10% (Ctrl+Shift+UpArrow): Increase magnification by 10% and recompile
* Magnification -10% (Ctrl+Shift+DownArrow): Decrease magnification by 10% and recompile
* Generate PDF File: Compiles your document to a PDF file

## No preview showing?

* Check the output log for error messages
* Set Debug Mode for detailed logs
* There may be fonts, images or LaTeX packages that were not found
* If you are using a Linux distribution such as Ubuntu then your LaTeX distribution may have been installed by their repository system. In this case the latest loaotfload package may not be available. To get around this you can install a LaTeX native distribution side-by-side with the Ubuntu installation and point your LaTeX Font Directory to the native path.
* Depending on your LaTeX distribution you may or may not be prompted to install packages
* If you are using math packages ensure that you add the ```unicode-math``` package after all other math packages.
* If you are using the ```amsart``` document class you may need to use the ```noamsfonts``` option
* Check package documentation for compatibility with LuaLaTeX. You may need to choose alternative packages.
* Install all required fonts and packages and try again

## Possible future enhancements

* Color text support
* Printing
* Saving of decoded DVI data in JSON format to enable document distribution for the web
* A NodeJS module for rendering JSON document files to a browser canvas
