import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { patchConfigSource } from './configPatch.ts';

export interface TuningSaveEntry {
  /** File name inside src/config, e.g. "kaiju.ts". */
  file: string;
  exportName: string;
  values: Record<string, number>;
}

const FILE = /^[a-zA-Z]+\.ts$/;
const EXPORT = /^[A-Z][A-Z0-9_]*$/;

/**
 * Dev-server-only endpoint used by the in-game tuning panel to write values
 * back into src/config/*.ts as the new defaults. Never part of a build.
 */
export function tuningPlugin(): Plugin {
  return {
    name: 'kaiju-tuning-save',
    apply: 'serve',
    configureServer(server) {
      const configDir = resolve(server.config.root, 'src/config');
      server.middlewares.use('/__tuning/save', (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        // Custom header = only our own page (same-origin fetch) can call this.
        if (req.method !== 'POST' || req.headers['x-kaiju-tuning'] !== '1') return reply(403, { error: 'forbidden' });

        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk.toString()));
        req.on('end', async () => {
          try {
            const entries = JSON.parse(body) as TuningSaveEntry[];
            const byFile = new Map<string, TuningSaveEntry[]>();
            for (const e of entries) {
              if (!FILE.test(e.file) || !EXPORT.test(e.exportName)) throw new Error(`Rejected ${e.file}:${e.exportName}`);
              byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
            }
            const applied: string[] = [];
            const skipped: string[] = [];
            for (const [file, list] of byFile) {
              const path = resolve(configDir, file);
              let src = await readFile(path, 'utf8');
              for (const e of list) {
                const r = patchConfigSource(src, e.exportName, e.values);
                src = r.source;
                applied.push(...r.applied.map((k) => `${e.exportName}.${k}`));
                skipped.push(...r.skipped.map((k) => `${e.exportName}.${k}`));
              }
              await writeFile(path, src);
            }
            server.config.logger.info(`[tuning] saved ${applied.length} value(s)${skipped.length ? `, skipped ${skipped.join(', ')}` : ''}`);
            reply(200, { applied, skipped });
          } catch (err) {
            reply(400, { error: String(err) });
          }
        });
      });
    },
  };
}
