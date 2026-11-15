// The free sample libraries the packs are cut from. Each is pinned, to a commit
// or to a release archive and its hash, so a pack can be cut again from exactly
// what it was cut from the first time. Licences are read from the fetched files
// and copied beside each pack; see docs/AUDIO_NOTES.md for what is known about
// each source.

interface Common {
  /** The folder under `.sources/`. */
  readonly id: string;
  readonly title: string;
  readonly author: string;
  /** The licence's SPDX name, as read from the licence file at this version. */
  readonly licence: string;
  /** The licence file's path in the source's folder. */
  readonly licenceFile: string;
}

/** A library kept in a git repository, fetched at one commit. */
export interface GitSource extends Common {
  readonly repo: string;
  readonly commit: string;
  /** Folders to fetch. Omit to fetch everything. Top-level files always come. */
  readonly paths?: readonly string[];
}

/** A library published as a release archive, fetched, checked and unpacked with `7z`. */
export interface ArchiveSource extends Common {
  /** Where a person finds the library: the credit's link. */
  readonly home: string;
  /** The release's name, for the credit. */
  readonly release: string;
  /** The archive's URL. */
  readonly archive: string;
  /** The archive's SHA-256, in hex. A download that does not match is not unpacked. */
  readonly sha256: string;
}

export type Source = GitSource | ArchiveSource;

export function isArchive(source: Source): source is ArchiveSource {
  return "archive" in source;
}

/** The link and the version a pack's credit gives for its source. */
export function where(source: Source): { url: string; version: string } {
  return isArchive(source)
    ? { url: source.home, version: source.release }
    : { url: source.repo, version: source.commit };
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
  {
    id: "black-and-blue-basses",
    title: "Black And Blue Basses",
    author: "Karoryfer Samples",
    repo: "https://github.com/sfzinstruments/karoryfer.black-and-blue-basses",
    commit: "6e7d674cdb41be7a54dbccb15472401ad01099b9",
    licence: "CC0-1.0",
    licenceFile: "license",
    paths: [
      "Programs",
      "Samples/darkblack/reg",
      "Samples/darkblack/ghost",
      "Samples/darkblack/stac",
    ],
  },
  {
    id: "fsbs-clean-guitar",
    title: "Electric Guitar FSBS (clean)",
    author: "FreePats",
    home: "https://github.com/freepats/electric-guitar-FSBS-clean",
    release: "2026-08-07",
    archive:
      "https://github.com/freepats/electric-guitar-FSBS-clean/releases/download/2026-08-07/EGuitarFSBS-clean-SFZ+FLAC-20260807.7z",
    sha256: "a929a3cbfc8289e325be56dab49f5fd560bbc3995c40b69f8f05caee380e8be3",
    licence: "CC0-1.0",
    licenceFile: "EGuitarFSBS-clean SFZ+FLAC-20260807/LICENSE.txt",
  },
  {
    id: "jrhodes3d",
    title: "jRhodes3d",
    author: "Jeff Learman",
    repo: "https://github.com/sfzinstruments/jlearman.jRhodes3d",
    commit: "aea5b8d3e11e2f7102593789a4e0a0e41b30271a",
    // Not a permissive licence: non-commercial. See DECISIONS.md.
    licence: "CC-BY-NC-4.0",
    licenceFile: "LICENSE",
  },
  {
    id: "emilyguitar",
    title: "Emilyguitar",
    author: "Karoryfer Samples",
    repo: "https://github.com/sfzinstruments/karoryfer.emilyguitar",
    commit: "b4920dc662fd9cad6dcaccdeecffdd91c8725d8c",
    licence: "CC0-1.0",
    licenceFile: "LICENSE",
  },
];

export function sourceById(id: string): Source {
  const source = SOURCES.find((s) => s.id === id);
  if (!source) throw new Error(`no source called ${id}`);
  return source;
}
