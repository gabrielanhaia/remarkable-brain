#!/usr/bin/env node
import { accessSync, constants, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { loadConfig } from './config.js';
import { openDb, migrate, type DB } from './storage/db.js';
import { Repo } from './storage/repo.js';
import { runDoctor } from './cli/doctor.js';
import { notebooksTable } from './cli/render-table.js';
import { tarArgs, resolveBackupDest } from './cli/backup.js';
import { createRmapi } from './sync/rmapi.js';
import { createRenderer } from './sync/render.js';
import { runSync } from './sync/sync.js';
import { extractPage, createAnthropicClient } from './extraction/extract.js';

function hasBin(bin: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function openRepo(): { cfg: ReturnType<typeof loadConfig>; repo: Repo; db: DB } {
  const cfg = loadConfig();
  mkdirSync(cfg.home, { recursive: true });
  const db = openDb(cfg.dbPath);
  migrate(db);
  return { cfg, repo: new Repo(db), db };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'doctor': {
      const cfg = loadConfig();
      let writable = true;
      try {
        mkdirSync(cfg.home, { recursive: true });
        accessSync(cfg.home, constants.W_OK);
      } catch {
        writable = false;
      }
      const res = runDoctor(process.env, { hasBin, homeWritable: writable });
      p.intro(pc.bold('rm-brain doctor'));
      for (const r of res)
        p.log.message(`${r.ok ? pc.green('✓') : pc.red('✗')} ${r.name} — ${pc.dim(r.detail)}`);
      p.outro(res.every((r) => r.ok) ? pc.green('All good') : pc.yellow('Some checks failed'));
      break;
    }
    case 'info': {
      const { cfg, repo } = openRepo();
      const nbs = repo.listNotebooks();
      const pages = nbs.reduce((s, n) => s + n.pageCount, 0);
      const dbSize = existsSync(cfg.dbPath) ? statSync(cfg.dbPath).size : 0;
      p.intro(pc.bold('rm-brain'));
      p.log.message(`Data home:  ${pc.cyan(cfg.home)}  ${pc.dim('(portable — copy this folder to back up)')}`);
      p.log.message(`Database:   ${cfg.dbPath} ${pc.dim(`(${fmtBytes(dbSize)})`)}`);
      p.log.message(`Images:     ${cfg.imagesDir}`);
      p.log.message(`Indexed:    ${nbs.length} notebooks, ${pages} pages`);
      p.outro('Tip: set RM_BRAIN_HOME to a Dropbox/iCloud folder to back up & roam automatically.');
      break;
    }
    case 'backup': {
      const { cfg } = openRepo();
      // Fold any WAL contents into the main db file so the archive is a clean snapshot.
      try {
        const db = openDb(cfg.dbPath);
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch {
        /* checkpoint is best-effort */
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = resolveBackupDest(process.cwd(), rest[0], stamp);
      execFileSync('tar', tarArgs(cfg.home, dest), { stdio: 'ignore' });
      p.log.success(`Backup written to ${pc.cyan(dest)} ${pc.dim(`(${fmtBytes(statSync(dest).size)})`)}`);
      p.log.message(pc.dim('Restore: extract it and point RM_BRAIN_HOME at the resulting folder.'));
      break;
    }
    case 'list': {
      const { repo } = openRepo();
      console.log(notebooksTable(repo.listNotebooks()));
      break;
    }
    case 'search': {
      const { repo } = openRepo();
      const q = rest.join(' ');
      if (!q) {
        p.log.error('Usage: rm-brain search "<query>"');
        break;
      }
      const hits = repo.searchNotes(q);
      if (hits.length === 0) p.log.message(pc.dim('No matches.'));
      for (const h of hits)
        console.log(
          `${pc.cyan(h.notebookName)} p${h.pageNumber} ${pc.dim(h.writtenAt ?? '')}\n  ${h.snippet}`
        );
      break;
    }
    case 'exclude':
    case 'include': {
      const { repo } = openRepo();
      const name = rest.join(' ');
      const nb = repo.listNotebooks().find((n) => n.name === name);
      if (!nb) {
        p.log.error(`No indexed notebook named "${name}"`);
        break;
      }
      if (cmd === 'exclude') {
        const imgs = repo.purgeNotebook(nb.id);
        for (const img of imgs) rmSync(img, { force: true });
        repo.upsertNotebook({ id: nb.id, name: nb.name, excluded: true });
        p.log.success(`Excluded and purged "${name}" (${imgs.length} images removed)`);
      } else {
        repo.setExcluded(nb.id, false);
        p.log.success(`Included "${name}" (re-sync to re-index)`);
      }
      break;
    }
    case 'purge': {
      const { cfg, repo } = openRepo();
      const ok = await p.confirm({
        message: `Delete the ENTIRE local index at ${cfg.home}? This cannot be undone.`,
      });
      if (ok === true) {
        repo.purgeAll();
        rmSync(cfg.imagesDir, { recursive: true, force: true });
        rmSync(cfg.manifestPath, { force: true });
        p.log.success('Index purged.');
      } else p.log.message('Aborted.');
      break;
    }
    case 'sync': {
      const { cfg, repo } = openRepo();
      if (!cfg.anthropicApiKey) {
        p.log.error('ANTHROPIC_API_KEY not set — required for sync.');
        process.exit(1);
      }
      const client = await createAnthropicClient(cfg.anthropicApiKey);
      const spin = p.spinner();
      spin.start('Syncing…');
      const summary = await runSync({
        repo,
        rmapi: createRmapi(cfg.rmapiBin),
        renderer: createRenderer(cfg.rmcBin, cfg.rsvgBin),
        extract: (img) => extractPage({ imagePath: img, model: cfg.anthropicModel, client }),
        manifestPath: cfg.manifestPath,
        imagesDir: cfg.imagesDir,
        tmpDir: cfg.home,
        log: (m) => spin.message(m),
      });
      spin.stop('Sync complete');
      p.log.message(
        `Docs synced: ${summary.docsSynced}, pages extracted: ${summary.pagesExtracted}, ` +
          `excluded: ${summary.skippedExcluded.length}, errors: ${summary.errors.length}`
      );
      for (const e of summary.errors)
        p.log.warn(`error: doc ${e.docId}${e.page ? ` page ${e.page}` : ''}: ${e.message}`);
      break;
    }
    case 'setup': {
      await runSetupWizard();
      break;
    }
    case 'mcp': {
      await import('./mcp/server.js');
      break;
    }
    default:
      console.log(
        [
          `${pc.bold('rm-brain')} <command>`,
          '',
          '  setup            interactive setup wizard',
          '  sync             pull #brain notebooks and index them',
          '  search <query>   full-text search in the terminal',
          '  list             show indexed notebooks',
          '  info             show where data lives + stats',
          '  backup [dest]    write a portable .tar.gz of the whole index',
          '  exclude <name>   exclude a notebook (purges its indexed pages)',
          '  include <name>   re-include a previously excluded notebook',
          '  purge            delete the entire local index',
          '  doctor           check dependencies',
          '  mcp              start the MCP server (for Claude Desktop)',
        ].join('\n')
      );
  }
}

async function runSetupWizard(): Promise<void> {
  const cfg = loadConfig();
  p.intro(pc.bold('rm-brain setup'));
  if (!hasBin(cfg.rmapiBin))
    p.log.warn(
      `rmapi not found. Install the ddvk sync15 build, then run: ${pc.cyan(cfg.rmapiBin)} (it prompts to pair a one-time code).`
    );
  else p.log.success('rmapi found.');
  if (!hasBin(cfg.rmcBin)) p.log.warn('rmc not found. Install with: pipx install rmc');
  else p.log.success('rmc found.');
  if (!hasBin(cfg.rsvgBin)) p.log.warn('rsvg-convert not found. Install with: brew install librsvg');
  else p.log.success('rsvg-convert found.');
  if (!cfg.anthropicApiKey)
    p.log.warn('Set ANTHROPIC_API_KEY in your environment before running sync.');
  else p.log.success('ANTHROPIC_API_KEY is set.');

  const block = JSON.stringify(
    { mcpServers: { 'rm-brain': { command: 'rm-brain', args: ['mcp'], env: { RM_BRAIN_HOME: cfg.home } } } },
    null,
    2
  );
  p.note(block, 'Paste into Claude Desktop config → mcpServers');
  p.outro('Run `rm-brain doctor` to verify, tag a notebook #brain, then `rm-brain sync`.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
