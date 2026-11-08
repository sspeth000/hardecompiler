(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fileInput = $("fileInput");
  const dropzone = $("dropzone");
  const browseButton = $("browseButton");
  const extractButton = $("extractButton");
  const selectedFile = $("selectedFile");
  const progressWrap = $("progressWrap");
  const results = $("results");
  let selectedHar = null;
  let generatedZip = null;

  const MIME_EXTENSIONS = {
    "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
    "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
    "image/avif": "avif", "image/bmp": "bmp", "image/x-icon": "ico",
    "text/css": "css", "text/html": "html", "application/xhtml+xml": "html",
    "text/javascript": "js", "application/javascript": "js",
    "application/x-javascript": "js", "application/json": "json",
    "application/ld+json": "json", "application/xml": "xml", "text/xml": "xml",
    "text/plain": "txt", "text/csv": "csv", "application/pdf": "pdf",
    "application/wasm": "wasm", "application/zip": "zip",
    "application/gzip": "gz", "application/octet-stream": "bin",
    "font/woff": "woff", "font/woff2": "woff2", "application/font-woff": "woff",
    "application/font-woff2": "woff2", "application/vnd.ms-fontobject": "eot",
    "font/ttf": "ttf", "font/otf": "otf", "application/x-font-ttf": "ttf",
    "application/x-font-opentype": "otf", "audio/mpeg": "mp3",
    "audio/ogg": "ogg", "audio/wav": "wav", "video/mp4": "mp4",
    "video/webm": "webm"
  };

  const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/javascript", "application/xml", "image/svg+xml"];

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + " " + units[index];
  }

  function safeSegment(value) {
    return String(value || "")
      .replace(/[<>:"/\\\\|?*\\x00-\\x1f]/g, "_")
      .replace(/\\.{2,}/g, ".")
      .replace(/^\\.+$/, "_")
      .trim() || "_";
  }

  function extensionFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const last = pathname.split("/").filter(Boolean).pop() || "";
      const match = last.match(/\\.([a-z0-9]{1,10})$/i);
      return match ? match[1].toLowerCase() : "";
    } catch {
      return "";
    }
  }

  function pathFromEntry(entry, index, keepPaths) {
    let url;
    try { url = new URL(entry.request && entry.request.url); }
    catch { return "unknown-host/resource-" + (index + 1); }

    const host = safeSegment(url.hostname || "unknown-host");
    if (!keepPaths) {
      const ext = extensionFromUrl(url.href);
      return host + "/resource-" + String(index + 1).padStart(4, "0") + (ext ? "." + ext : "");
    }

    const segments = url.pathname.split("/").filter(Boolean).map(safeSegment);
    let filename = segments.pop() || "index";
    if (!/\\.[a-z0-9]{1,10}$/i.test(filename)) {
      const mime = normalizeMime(entry.response && entry.response.content && entry.response.content.mimeType);
      const ext = MIME_EXTENSIONS[mime] || "bin";
      filename += "." + ext;
    }
    return [host, ...segments, filename].join("/");
  }

  function normalizeMime(value) {
    return String(value || "").split(";")[0].trim().toLowerCase();
  }

  function decodeBase64(value) {
    const cleaned = String(value).replace(/\\s/g, "");
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bodyToBytes(content) {
    const body = content.text;
    if (content.encoding === "base64") return decodeBase64(body);
    if (typeof body !== "string") return null;

    const dataUrl = body.match(/^data:([^;,]+)?(;base64)?,([\\s\\S]*)$/i);
    if (dataUrl) {
      if (dataUrl[2]) return decodeBase64(dataUrl[3]);
      return new TextEncoder().encode(decodeURIComponent(dataUrl[3]));
    }

    return new TextEncoder().encode(body);
  }

  function uniquePath(path, used) {
    if (!used.has(path.toLowerCase())) {
      used.add(path.toLowerCase());
      return path;
    }
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash + 1) : "";
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let count = 2;
    let candidate;
    do {
      candidate = folder + stem + " (" + count++ + ")" + ext;
    } while (used.has(candidate.toLowerCase()));
    used.add(candidate.toLowerCase());
    return candidate;
  }

  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function setProgress(percent, message) {
    $("progressBar").style.width = percent + "%";
    $("progressPercent").textContent = percent + "%";
    $("progressText").textContent = message;
  }

  function showSelectedFile(file) {
    selectedHar = file;
    $("fileName").textContent = file.name;
    $("fileSize").textContent = formatBytes(file.size);
    selectedFile.classList.remove("hidden");
    dropzone.classList.add("hidden");
    extractButton.disabled = false;
    progressWrap.classList.add("hidden");
    results.classList.add("hidden");
    generatedZip = null;
  }

  function clearSelection() {
    selectedHar = null;
    fileInput.value = "";
    selectedFile.classList.add("hidden");
    dropzone.classList.remove("hidden");
    extractButton.disabled = true;
    progressWrap.classList.add("hidden");
    results.classList.add("hidden");
    generatedZip = null;
  }

  // Accept any file here. Parsing and structural errors are handled by extractHar().
  function acceptFile(file) {
    if (!file) return;
    showSelectedFile(file);
  }

  async function extractHar() {
    if (!selectedHar) return;
    if (typeof JSZip === "undefined") {
      alert("The ZIP library could not load. Check your connection and refresh the page.");
      return;
    }

    extractButton.disabled = true;
    results.classList.add("hidden");
    progressWrap.classList.remove("hidden");
    setProgress(3, "Reading HAR archive…");

    try {
      const raw = await selectedHar.text();
      let har;
      try { har = JSON.parse(raw); }
      catch { throw new Error("Could not parse this file as JSON. If it is a text file, make sure it contains the raw HAR JSON."); }

      const entries = har && har.log && Array.isArray(har.log.entries) ? har.log.entries : null;
      if (!entries) throw new Error("The parsed JSON does not contain a HAR log.entries array.");

      const zip = new JSZip();
      const usedPaths = new Set();
      const reportRows = [["status", "file", "url", "mime_type", "bytes", "note"]];
      const failures = [];
      let extracted = 0;
      let skipped = 0;
      let totalBytes = 0;
      const keepPaths = $("keepPaths").checked;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i] || {};
        const response = entry.response || {};
        const content = response.content || {};
        const url = entry.request && entry.request.url ? entry.request.url : "";
        const mime = normalizeMime(content.mimeType || (response.headers || []).find(h => String(h.name).toLowerCase() === "content-type")?.value);
        const hasBody = Object.prototype.hasOwnProperty.call(content, "text") && typeof content.text === "string";

        if (!hasBody) {
          skipped++;
          const note = "No response body was embedded in this HAR entry.";
          reportRows.push(["skipped", "", url, mime, 0, note]);
          continue;
        }

        try {
          const bytes = bodyToBytes(content);
          if (!bytes) throw new Error("Unsupported response body representation.");
          let path = pathFromEntry(entry, i, keepPaths);
          if (!/\\.[a-z0-9]{1,10}$/i.test(path)) {
            const ext = MIME_EXTENSIONS[mime] || (TEXT_MIME_PREFIXES.some(prefix => mime.startsWith(prefix)) ? "txt" : "bin");
            path += "." + ext;
          }
          path = uniquePath(path, usedPaths);
          zip.file(path, bytes, { binary: true, createFolders: true });
          extracted++;
          totalBytes += bytes.byteLength;
          reportRows.push(["extracted", path, url, mime, bytes.byteLength, ""]);
        } catch (error) {
          skipped++;
          const note = error && error.message ? error.message : "Could not decode response body.";
          failures.push(note);
          reportRows.push(["skipped", "", url, mime, 0, note]);
        }

        if (i % 20 === 0 || i === entries.length - 1) {
          const percent = Math.max(5, Math.round(((i + 1) / Math.max(entries.length, 1)) * 75));
          setProgress(percent, "Extracting response bodies… (" + (i + 1) + "/" + entries.length + ")");
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      if ($("includeReport").checked) {
        const csv = reportRows.map(row => row.map(csvEscape).join(",")).join("\\r\\n");
        zip.file("_har-decompiler-report.csv", csv);
        zip.file("_har-decompiler-summary.txt",
          "HAR Decompiler extraction report\\n" +
          "Source: " + selectedHar.name + "\\n" +
          "Entries scanned: " + entries.length + "\\n" +
          "Files extracted: " + extracted + "\\n" +
          "Entries skipped: " + skipped + "\\n" +
          "Recovered bytes: " + totalBytes + "\\n\\n" +
          "Skipped entries generally have no embedded response body, or contain a body that could not be decoded.\\n");
      }

      setProgress(82, "Building ZIP archive…");
      generatedZip = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 5 } },
        metadata => setProgress(82 + Math.round(metadata.percent * 0.18), "Compressing ZIP archive…")
      );

      $("extractedCount").textContent = extracted.toLocaleString();
      $("skippedCount").textContent = skipped.toLocaleString();
      $("totalBytes").textContent = formatBytes(totalBytes);
      $("resultNote").textContent = extracted
        ? "Recovered " + extracted + " file(s) from " + entries.length + " HAR entr" + (entries.length === 1 ? "y" : "ies") + ". " + skipped + " entr" + (skipped === 1 ? "y was" : "ies were") + " skipped. " + (failures.length ? failures.length + " decoding issue(s) are listed in the report." : "Check the report inside the ZIP for entry-by-entry details.")
        : "No response bodies could be recovered. This HAR may have been exported without response content. The report explains what was skipped.";
      $("downloadButton").disabled = false;
      results.classList.remove("hidden");
      setProgress(100, "ZIP archive ready.");
    } catch (error) {
      progressWrap.classList.add("hidden");
      alert(error && error.message ? error.message : "An unexpected error occurred while reading this HAR.");
    } finally {
      extractButton.disabled = false;
    }
  }

  function downloadZip() {
    if (!generatedZip) return;
    const url = URL.createObjectURL(generatedZip);
    const anchor = document.createElement("a");
    const baseName = selectedHar ? selectedHar.name.replace(/\\.har$/i, "") : "har-export";
    anchor.href = url;
    anchor.download = (baseName || "har-export") + "-extracted.zip";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  browseButton.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("click", event => {
    if (event.target !== browseButton) fileInput.click();
  });
  dropzone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => acceptFile(fileInput.files[0]));
  $("removeFile").addEventListener("click", clearSelection);
  $("resetButton").addEventListener("click", clearSelection);
  extractButton.addEventListener("click", extractHar);
  $("downloadButton").addEventListener("click", downloadZip);

  ["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  }));
  dropzone.addEventListener("drop", event => acceptFile(event.dataTransfer.files[0]));
})();