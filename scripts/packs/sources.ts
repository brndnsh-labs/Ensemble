// The free sample libraries the packs are cut from. Each is pinned to a commit,
// so a pack can be cut again from exactly what it was cut from the first time.
// Licences are read from the fetched files and copied beside each pack; see
// docs/AUDIO_NOTES.md for what is known about each source.

export interface Source {
  /** The folder under `.sources/`. */
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly repo: string;
  readonly commit: string;
  /** The licence's SPDX name, as read from the licence file at this commit. */
  readonly licence: string;
  /** The licence file's path in the source. */
  readonly licenceFile: string;
  /** Folders to fetch. Omit to fetch everything. Top-level files always come. */
  readonly paths?: readonly string[];
}

export const SOURCES: readonly Source[] = [
  {
    id: "virtuosity-drums",
    title: "Virtuosity Drums",
    author: "Versilian Studios and Karoryfer Samples",
    repo: "https://github.com/sfzinstruments/virtuosity_drums",
    commit: "9f04cf9a734527edfbb0a4eee1f674e45bbf71bc",
    licence: "CC0-1.0",
    licenceFile: "LICENSE",
    paths: ["Programs", "Samples"],
  },
  {
    id: "vcsl",
    title: "Versilian Community Sample Library",
    author: "Versilian Studios",
    repo: "https://github.com/sgossner/VCSL",
    commit: "c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e",
    licence: "CC0-1.0",
    licenceFile: "LICENSE",
    paths: ["Idiophones/Struck Idiophones/Vibraphone"],
  },
  {
    id: "vsco-2-ce",
    title: "VSCO 2 Community Edition",
    author: "Versilian Studios",
    repo: "https://github.com/sgossner/VSCO-2-CE",
    commit: "440300901dfe9275fd84e0b7763af1f8443ae62e",
    licence: "CC0-1.0",
    licenceFile: "LICENSE",
    paths: ["Strings/Solo Contrabass"],
  },
  {
    id: "meatbass",
    title: "Meatbass",
    author: "Karoryfer Samples",
    repo: "https://github.com/sfzinstruments/karoryfer.meatbass",
    commit: "ac9e859564bda286ab5ec672d00ff1aa2fef2895",
    licence: "CC0-1.0",
    licenceFile: "LICENSE",
    paths: ["Programs", "Samples/pizz"],
  },
  {
    id: "salamander",
    title: "Salamander Grand Piano V3",
    author: "Alexander Holm",
    repo: "https://github.com/sfzinstruments/SalamanderGrandPiano",
    commit: "3382bf9496bba2486f5ab0de55a264d1dfc38404",
    licence: "CC-BY-3.0",
    licenceFile: "LICENSE",
    paths: ["Data", "Samples"],
  },
  {
    id: "weresax",
    title: "Weresax",
    author: "Karoryfer Samples",
    repo: "https://github.com/sfzinstruments/karoryfer.weresax",
    commit: "a4d756b21d2a573aca0d840cce7e71ba5effd4c6",
    licence: "CC0-1.0",
    licenceFile: "LICENSE",
    paths: ["Programs", "Samples"],
  },
];

export function sourceById(id: string): Source {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`no source called ${id}`);
  return source;
}
