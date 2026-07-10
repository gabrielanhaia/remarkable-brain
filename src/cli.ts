#!/usr/bin/env node
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { resolveConfig, isUnderFolder, type Config } from './config.js';
import { writeStore } from './store.js';
import { openDb, migrate, type DB } from './storage/db.js';
import { Repo } from './storage/repo.js';
import { runDoctor } from './cli/doctor.js';
import { notebooksTable } from './cli/render-table.js';
import { tarArgs, resolveBackupDest } from './cli/backup.js';
import { createRmapi } from './sync/rmapi.js';
import { createRenderer } from './sync/render.js';
import { runSync, type SyncSummary } from './sync/sync.js';
import { extractPage, createAnthropicClient } from './extraction/extract.js';

/** Read `--flag value` or `--flag=value` from an argv slice; returns undefined if absent. */
function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i !== -1 && i + 1 < args.length) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : undefined;
}

function hasBin(bin: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function openRepo(): { cfg: Config; repo: Repo; db: DB } {
  const cfg = resolveConfig();
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

/** True if rmapi is paired (has a working device token). */
function rmapiPaired(bin: string): boolean {
  try {
    execFileSync(bin, ['-ni', 'account'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Refresh the remote tree and return the paths of documents inside the Brain folder. */
function detectFolderDocs(bin: string, folder: string): string[] {
  try {
    execFileSync(bin, ['-ni', 'refresh'], { stdio: 'ignore' });
  } catch {
    // refresh is best-effort
  }
  try {
    return execFileSync(bin, ['-ni', 'find', '--compact', '/'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 32,
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(
        (s) =>
          s && s !== '/' && !s.endsWith('/') && !s.startsWith('/trash/') && isUnderFolder(s, folder)
      );
  } catch {
    return [];
  }
}

function claudeConfigPath(): string {
  return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
}

function mcpBlock(home: string) {
  return { mcpServers: { 'rm-brain': { command: 'rm-brain', args: ['mcp'], env: { RM_BRAIN_HOME: home } } } };
}

function writeClaudeConfig(home: string): string {
  const path = claudeConfigPath();
  let cfg: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      cfg = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      cfg = {};
    }
  }
  const servers = (cfg.mcpServers as Record<string, unknown>) ?? {};
  servers['rm-brain'] = { command: 'rm-brain', args: ['mcp'], env: { RM_BRAIN_HOME: home } };
  cfg.mcpServers = servers;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2));
  return path;
}

/** Shared sync runner used by both `sync` and the wizard. */
async function doSync(cfg: Config, repo: Repo): Promise<SyncSummary> {
  const client = await createAnthropicClient(cfg.anthropicApiKey!);
  const spin = p.spinner();
  spin.start('Syncing…');
  const summary = await runSync({
    repo,
    rmapi: createRmapi(cfg.rmapiBin),
    renderer: createRenderer(cfg.rmcBin, cfg.rsvgBin),
    extract: (img) => extractPage({ imagePath: img, model: cfg.anthropicModel, client }),
    brainFolder: cfg.brainFolder,
    manifestPath: cfg.manifestPath,
    imagesDir: cfg.imagesDir,
    tmpDir: cfg.home,
    log: (m) => spin.message(m),
  });
  spin.stop('Sync complete');
  p.log.message(
    `Docs synced: ${summary.docsSynced}, pages extracted: ${summary.pagesExtracted}, ` +
      `pruned: ${summary.pruned.length}, excluded: ${summary.skippedExcluded.length}, ` +
      `errors: ${summary.errors.length}`
  );
  for (const name of summary.pruned) p.log.message(pc.dim(`  removed: ${name}`));
  for (const e of summary.errors)
    p.log.warn(`error: doc ${e.docId}${e.page ? ` page ${e.page}` : ''}: ${e.message}`);
  return summary;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'doctor': {
      const cfg = resolveConfig();
      let writable = true;
      try {
        mkdirSync(cfg.home, { recursive: true });
        accessSync(cfg.home, constants.W_OK);
      } catch {
        writable = false;
      }
      const res = runDoctor(cfg, { hasBin, homeWritable: writable });
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
      p.log.message(
        `Data home:  ${pc.cyan(cfg.home)}  ${pc.dim('(portable — copy this folder to back up)')}`
      );
      p.log.message(`Database:   ${cfg.dbPath} ${pc.dim(`(${fmtBytes(dbSize)})`)}`);
      p.log.message(`Images:     ${cfg.imagesDir}`);
      p.log.message(`Indexed:    ${nbs.length} notebooks, ${pages} pages`);
      p.outro('Tip: set RM_BRAIN_HOME to a Dropbox/iCloud folder to back up & roam automatically.');
      break;
    }
    case 'backup': {
      const { cfg } = openRepo();
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
      p.log.success(
        `Backup written to ${pc.cyan(dest)} ${pc.dim(`(${fmtBytes(statSync(dest).size)})`)}`
      );
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
        p.log.error('No Anthropic API key. Run `rm-brain setup` to save one, or set ANTHROPIC_API_KEY.');
        process.exit(1);
      }
      p.intro(pc.bold('rm-brain sync'));
      await doSync(cfg, repo);
      p.outro('Done. Ask Claude Desktop about your notes, or `rm-brain search "..."`.');
      break;
    }
    case 'reindex': {
      const { cfg, repo } = openRepo();
      if (!cfg.anthropicApiKey) {
        p.log.error('No Anthropic API key. Run `rm-brain setup` to save one, or set ANTHROPIC_API_KEY.');
        process.exit(1);
      }
      p.intro(pc.bold('rm-brain reindex'));
      rmSync(cfg.manifestPath, { force: true }); // forget all hashes → re-extract every in-folder page
      p.log.message('Cleared change-detection state; re-extracting all notebooks in the Brain folder…');
      await doSync(cfg, repo);
      p.outro('Reindex complete.');
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
    case 'web': {
      const { startWebServer } = await import('./web/server.js');
      const port = flagValue(rest, '--port');
      const host = flagValue(rest, '--host');
      await startWebServer({
        port: port ? Number(port) : undefined,
        host: host || undefined,
        open: !rest.includes('--no-open'),
      });
      break;
    }
    default:
      console.log(
        [
          `${pc.bold('rm-brain')} <command>`,
          '',
          `  ${pc.green('setup')}            one-command guided setup (start here)`,
          '  sync             pull Brain-folder notebooks and index them',
          '  reindex          re-extract all indexed pages (after a prompt/model change)',
          '  search <query>   full-text search in the terminal',
          '  list             show indexed notebooks',
          '  info             show where data lives + stats',
          '  backup [dest]    write a portable .tar.gz of the whole index',
          '  exclude <name>   exclude a notebook (purges its indexed pages)',
          '  include <name>   re-include a previously excluded notebook',
          '  purge            delete the entire local index',
          '  doctor           check dependencies',
          '  mcp              start the MCP server (for Claude Desktop)',
          '  web              open the local read-only web app in your browser',
          '                     [--port 4123] [--host 127.0.0.1] [--no-open]',
        ].join('\n')
      );
  }
}

async function runSetupWizard(): Promise<void> {
  let cfg = resolveConfig();
  mkdirSync(cfg.home, { recursive: true });
  p.intro(pc.bold('rm-brain setup'));

  // 1) Dependencies
  const deps: [string, string, string][] = [
    ['rmapi', cfg.rmapiBin, 'install the ddvk sync15 build (see README)'],
    ['rmc', cfg.rmcBin, 'pipx install rmc'],
    ['rsvg-convert', cfg.rsvgBin, 'brew install librsvg'],
  ];
  let missing = false;
  for (const [name, bin, how] of deps) {
    if (hasBin(bin)) p.log.success(`${name} found`);
    else {
      p.log.warn(`${name} missing — ${how}`);
      missing = true;
    }
  }
  if (missing) {
    const cont = await p.confirm({ message: 'Some tools are missing. Continue anyway?' });
    if (p.isCancel(cont) || !cont) {
      p.cancel('Install the tools above, then re-run `rm-brain setup`.');
      return;
    }
  }

  // 2) rmapi pairing
  if (hasBin(cfg.rmapiBin)) {
    if (rmapiPaired(cfg.rmapiBin)) {
      p.log.success('rmapi is paired with your reMarkable account.');
    } else {
      p.log.warn('rmapi is not paired yet.');
      const doPair = await p.confirm({
        message: 'Pair now? Get a code from https://my.remarkable.com/device/desktop/connect first.',
      });
      if (!p.isCancel(doPair) && doPair) {
        p.log.message('Enter your one-time code at the prompt below:');
        try {
          execFileSync(cfg.rmapiBin, ['ls'], { stdio: 'inherit' });
          p.log.success('Paired.');
        } catch {
          p.log.error('Pairing did not complete. You can retry with `rm-brain setup`.');
        }
      }
    }
  }

  // 3) API key (persisted)
  if (cfg.anthropicApiKey) {
    p.log.success('Anthropic API key is configured.');
  } else {
    const key = await p.password({
      message: 'Paste your Anthropic API key (saved to ~/.rm-brain/config.json, chmod 600):',
    });
    if (!p.isCancel(key) && typeof key === 'string' && key.trim()) {
      writeStore(cfg.home, { anthropicApiKey: key.trim() });
      cfg = resolveConfig();
      p.log.success('API key saved.');
    } else {
      p.log.warn('No key saved — you can add it later by re-running setup.');
    }
  }

  // 4) Folder guidance + detection loop
  let found: string[] = [];
  if (hasBin(cfg.rmapiBin) && rmapiPaired(cfg.rmapiBin)) {
    p.note(
      `On the tablet, create a folder named "${cfg.brainFolder.replace(/^\//, '')}" ` +
        `(case-insensitive) and move the notebooks you want indexed into it.\n` +
        `Everything inside it gets indexed; remove a notebook from it and the next sync\n` +
        `drops it from your local index. Then let the tablet sync (Wi-Fi).`,
      'Your Brain folder'
    );
    for (;;) {
      const check = await p.confirm({ message: 'Check now for notebooks in the Brain folder?' });
      if (p.isCancel(check) || !check) break;
      const spin = p.spinner();
      spin.start('Refreshing and searching…');
      found = detectFolderDocs(cfg.rmapiBin, cfg.brainFolder);
      spin.stop(`Found ${found.length} notebook(s) in ${cfg.brainFolder}.`);
      if (found.length) {
        for (const f of found) p.log.message(`  • ${f}`);
        break;
      }
      const next = await p.select({
        message: 'None found yet. What next?',
        options: [
          { value: 'retry', label: 'I just moved notebooks in — check again' },
          { value: 'skip', label: 'Skip for now' },
        ],
      });
      if (p.isCancel(next) || next === 'skip') break;
    }
  }

  // 5) First sync
  if (cfg.anthropicApiKey && found.length) {
    const doNow = await p.confirm({ message: `Run the first sync now (${found.length} notebook(s))?` });
    if (!p.isCancel(doNow) && doNow) {
      const db = openDb(cfg.dbPath);
      migrate(db);
      await doSync(cfg, new Repo(db));
    }
  }

  // 6) Claude Desktop wiring
  if (process.platform === 'darwin') {
    const wire = await p.confirm({
      message: `Add rm-brain to Claude Desktop config at ${claudeConfigPath()}?`,
    });
    if (!p.isCancel(wire) && wire) {
      const written = writeClaudeConfig(cfg.home);
      p.log.success(`Updated ${written}. Restart Claude Desktop to load it.`);
    } else {
      p.note(JSON.stringify(mcpBlock(cfg.home), null, 2), 'Paste into Claude Desktop config → mcpServers');
    }
  } else {
    p.note(JSON.stringify(mcpBlock(cfg.home), null, 2), 'Paste into Claude Desktop config → mcpServers');
  }

  p.outro('All set. Run `rm-brain sync` anytime, then ask Claude Desktop about your notes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
