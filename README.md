# HAR Decompiler

A browser-based tool for extracting recoverable response bodies from HTTP Archive (HAR) files into a downloadable ZIP.

**Live site:** https://sspeth000.github.io/hardecompiler/  
**Repository:** https://github.com/sspeth000/hardecompiler

## Features

- Drag-and-drop or browse for a `.har` file.
- Extract embedded response bodies, including Base64-encoded binary files such as PNGs, JPEGs, fonts, and other assets.
- Recover ordinary text response bodies such as HTML, CSS, JavaScript, and JSON.
- Recreate folders from request hostnames and URL paths, or use a flatter resource naming scheme.
- Avoid path traversal and resolve duplicate filenames safely.
- Include a CSV extraction report and a plain-text summary in the ZIP.
- Process files entirely in the browser. The HAR is not uploaded to a server.

## Usage

1. Open the [HAR Decompiler website](https://sspeth000.github.io/hardecompiler/).
2. Drop a HAR file onto the upload area or browse to select one.
3. Choose whether to preserve URL-based folders and include the report.
4. Select **Extract files**.
5. Download the generated ZIP.

## Important limitation

A HAR can record a request without embedding its response body. This tool can only recover content that is actually present in `log.entries[].response.content.text`. Entries without an embedded body are listed as skipped in the report. It does not re-request missing resources from the original website.

## Development

This is a static client-side application. It uses [JSZip](https://stuk.github.io/jszip/) from a CDN to generate ZIP archives. No build step is required.

For local development, serve the repository with any static HTTP server, then open the page in a modern browser.

## License

MIT
