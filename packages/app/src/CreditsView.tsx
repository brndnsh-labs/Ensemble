// Whose recordings the band is made of, and under what licence. The piano's
// licence asks for exactly this page.

import type { Pack } from "@ensemble/audio";
import { useEffect, useState } from "react";
import { PACK_IDS } from "./offline.ts";
import { Trail } from "./Trail.tsx";

export function CreditsView({ packsUrl }: { packsUrl: string }) {
  const [packs, setPacks] = useState<readonly Pack[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all(
      PACK_IDS.map(
        async (id) => (await (await fetch(`${packsUrl}${id}/pack.json`)).json()) as Pack,
      ),
    ).then(
      (loaded) => current && setPacks(loaded),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [packsUrl]);

  return (
    <main className="credits">
      <Trail />
      <h1>Credits</h1>
      <p>
        The band plays recordings of real instruments, cut down from sample libraries their makers
        have shared freely. Each instrument's licence is kept beside its recordings.
      </p>
      <p>
        Ensemble counts how it is used, anonymously: which screens are visited, which built-in
        charts are opened and played, in which styles, and for how long. Nothing that identifies you
        is sent, nothing of your own charts but that one was used, and nothing at all with Do Not
        Track on.
      </p>
      {failed && <p role="alert">The credits could not be read. Check the connection.</p>}
      {packs?.map((pack) => (
        <section key={pack.id}>
          <h2>{pack.name}</h2>
          {pack.credits.map((credit) => (
            <div key={credit.title} className="credit">
              <p>
                <a href={credit.url}>{credit.title}</a> by {credit.author}, {credit.licence}.
                {/* A licence that keeps commercial use back says so in words, not only by name. */}
                {/-NC\b/.test(credit.licence) &&
                  " These recordings may not be used commercially: they are here because this app is free and is not sold."}
              </p>
              <p className="changes">Changes made: {credit.changes}</p>
            </div>
          ))}
          <p>
            <a className="licence" href={`${packsUrl}${pack.id}/LICENCE`}>
              Read the licence
            </a>
          </p>
        </section>
      ))}
    </main>
  );
}
