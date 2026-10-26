// @ts-check
// Hands a file to the browser as a download.

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * @param {Uint8Array} data
 * @param {string} fileName
 * @param {string} mime
 */
export function downloadFile(data, fileName, mime) {
  const url = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (data)], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
