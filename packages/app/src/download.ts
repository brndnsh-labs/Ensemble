// Handing the player a file: a chart from the editor, a take as MIDI or as
// its recipe. Nothing leaves the device but through their own download.

/** A file name from a title, without the characters some systems refuse in one. */
export const fileName = (title: string, otherwise: string, ending: string): string =>
  `${title.replace(/[\\/:*?"<>|]+/g, "-").trim() || otherwise}${ending}`;

export function download(contents: BlobPart, type: string, name: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([contents], { type }));
  link.download = name;
  link.click();
  // Some browsers read the file after the click has returned.
  setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
}
