export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, name: string): void {
  download(new Blob([text], { type: "text/plain" }), name);
}
