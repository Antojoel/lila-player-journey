import * as duckdb from "@duckdb/duckdb-wasm";
import ehWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

// Ship only the "eh" (WebAssembly exception-handling) build: it's supported by
// every browser since 2021 (Chrome 95+, Firefox 100+, Safari 15.4+) and halves
// the deploy — the "mvp" fallback would add ~39 MB that essentially no one loads.
// It also needs no COOP/COEP headers (only the threaded "coi" build would), so it
// works on any plain static host. Bundled locally, never fetched from a CDN.
const ehBundle = { mainModule: ehWasm, mainWorker: ehWorker };
// `mvp` points at the same assets so no second wasm file is emitted; on a modern
// browser selectBundle() always resolves to `eh` anyway.
const BUNDLES: duckdb.DuckDBBundles = { mvp: ehBundle, eh: ehBundle };

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/** Lazily instantiate a single shared DuckDB-WASM instance. */
export function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(BUNDLES);
      const worker = new Worker(bundle.mainWorker!);
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
      try {
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      } catch (e) {
        throw new Error(
          "Could not start the in-browser database (DuckDB-WASM). Your browser " +
            "may be too old — Chrome 95+, Firefox 100+ or Safari 15.4+ is needed. " +
            `(${String(e)})`,
        );
      }
      await db.open({ query: { castBigIntToDouble: true } });
      return db;
    })();
  }
  return dbPromise;
}
