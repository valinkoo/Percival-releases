/**
 * Saves a blob as a file, through the browser's download mechanism. Inside the Tauri shell the
 * WebView handles it like any download, so no native file-system permission is needed.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // The download starts asynchronously: give it time before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
