/**
 * @fileoverview Prepends JSDoc `@fileoverview` / `@module` to `src/**/*.js` files that lack them.
 * Safe to re-run: skips files whose lead comment already documents the module (Swagger, mirrors, etc.).
 * Run from backend: `node scripts/annotate-src-fileoverview.cjs`
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function titleCase(seg) {
  if (!seg) return '';
  return seg
    .split(/[-_]/g)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(' ');
}

function posixRel(file) {
  return path.relative(SRC, file).replace(/\\/g, '/');
}

function hasFileOverview(src) {
  const head = src.slice(0, 1200);
  return /\*\s*@fileoverview\b/.test(head);
}

function hasLeadingDocBanner(src) {
  const t = src.trimStart();
  if (!t.startsWith('/**')) return false;
  const end = t.indexOf('*/');
  if (end === -1) return false;
  const block = t.slice(0, end);
  if (/\*\s*@fileoverview\b/.test(block)) return true;
  if (/OpenAPI\s*3/i.test(block)) return true;
  if (/Mirrors essentials\/order-starus/i.test(block)) return true;
  if (/Mirrors `essentials\/order-starus/i.test(block)) return true;
  if (/Must match essentials\/order-transition/i.test(block)) return true;
  if (/optional ESM mongoose schema mirror/i.test(block)) return true;
  return false;
}

function describe(relPosix) {
  const bn = path.posix.basename(relPosix, '.js');
  const dir = path.posix.dirname(relPosix);
  const top = dir.split('/')[0];
  const second = dir.split('/')[1];

  if (relPosix === 'server.js') {
    return 'Process entry: env, MongoDB connect, optional seed bootstrap, queue registration, HTTP listen.';
  }
  if (relPosix === 'app.js') {
    return 'Express app: CORS/auth middleware, mounts `/api/*` routers, 404 + error handlers.';
  }
  if (top === 'config') {
    return `Configuration (${bn}).`;
  }
  if (top === 'constants') {
    return `Shared constants (${bn}).`;
  }
  if (top === 'utils') {
    return `Utilities (${bn}).`;
  }
  if (top === 'plugins') {
    return `Mongoose plugin: ${bn}.`;
  }
  if (top === 'middlewares') {
    return `Express middleware (${bn}).`;
  }
  if (top === 'docs') {
    return `Documentation artifact (${bn}).`;
  }
  if (top === 'queues') {
    return `Bull-ish / job queue wiring (${bn}).`;
  }
  if (top === 'workers') {
    return `Background worker (${bn}).`;
  }
  if (top === 'models') {
    return `ESM mongoose mirror for ${bn} (canonical runtime schemas live in data/mongoRegistry.js).`;
  }
  if (top === 'essentials') {
    return `Living design notes: ${bn} (paired with workflow/constants where noted).`;
  }
  if (top === 'data') {
    if (bn === 'mongoRegistry')
      return 'Registers all mongoose models/schemas used by this API (includes soft-delete where applied).';
    if (bn === 'mongoSyncUsers') return 'Upserts seed permissions/roles/example users against MongoDB.';
    if (bn === 'seedMongo') return 'Boot-time seed/bootstrap orchestration.';
    if (bn === 'exampleUserSeeder')
      return 'Fixture user payloads consumed by mongoSyncUsers.';
    return `Data/seeding (${bn}).`;
  }
  if (top === 'modules' && second) {
    const modLabel = titleCase(second);
    if (bn.endsWith('.service'))
      return `${modLabel}: business rules and mongoose persistence helpers.`;
    if (bn.endsWith('.controller')) return `${modLabel}: HTTP handlers (thin controllers).`;
    if (bn.endsWith('.routes')) return `${modLabel}: Express router mounts + RBAC wrappers.`;
    if (bn.endsWith('.validation')) return `${modLabel}: request body/query validation guards.`;
    if (bn.endsWith('.policy')) return `${modLabel}: policy checks (ownership / dept / state).`;

    const chunk = bn.replace(/-/g, ' ');
    if (dir.endsWith(`/modules/${second}/dashboard`) || bn.includes('.dashboard'))
      return `Dashboard KPIs (${second} slice / ${chunk}).`;

    return `${modLabel}: ${chunk}.`;
  }

  return `Source file (${bn}).`;
}

function makeBanner(summary, moduleId) {
  return [`/**`, ` * @fileoverview ${summary}`, ` * @module ${moduleId}`, ` */`, ''].join('\n');
}

function insertAfterUseStrict(raw, banner) {
  const m = raw.match(/^(['"])use strict\1;\r?\n/);
  if (m) return raw.slice(0, m[0].length) + banner + raw.slice(m[0].length);
  return banner + raw;
}

let patched = 0;
let skipped = 0;

for (const abs of walk(SRC)) {
  const rel = posixRel(abs);
  const raw = fs.readFileSync(abs, 'utf8');
  if (hasFileOverview(raw) || hasLeadingDocBanner(raw)) {
    skipped += 1;
    continue;
  }
  const banner = makeBanner(describe(rel), rel.replace(/\.js$/, ''));
  fs.writeFileSync(abs, insertAfterUseStrict(raw, banner));
  patched += 1;
}

console.error(`annotate fileoverview: patched=${patched} skipped=${skipped}`);
