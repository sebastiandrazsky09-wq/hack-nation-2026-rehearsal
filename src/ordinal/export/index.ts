import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_AS_OF } from '../contracts';
import { PATHS } from '../corpus';
import type { ExportOptions, ExportReport } from '../entrypoints';
import { EXPORT_FILES, buildExport, type BuildResult, type ExportDeps } from './build';

export type { ExportDeps } from './build';

/** Builds and writes every file; returns the build so a caller can inspect it. Files are written even when schema errors exist. */
export function exportToDir(asOf: string, outDir: string, deps: ExportDeps = {}): BuildResult {
  const build = buildExport(asOf, deps);
  mkdirSync(outDir, { recursive: true });
  for (const name of EXPORT_FILES) writeFileSync(path.join(outDir, name), build.files[name]);
  return build;
}

export async function runExport({ asOf = DEFAULT_AS_OF, outDir = PATHS.out }: ExportOptions, deps: ExportDeps = {}): Promise<ExportReport> {
  const build = exportToDir(asOf, outDir, deps);
  return {
    as_of: asOf, rules: build.exported.length, rules_withheld_unverified: build.withheld.length,
    addresses: build.addresses.length, lookup_rows: build.lookupRows, schema_errors: build.schemaErrors,
    files: EXPORT_FILES.map(name => path.join(outDir, name))
  };
}
