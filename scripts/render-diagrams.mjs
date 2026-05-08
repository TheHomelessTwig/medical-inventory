/**
 * render-diagrams.mjs
 *
 * Finds every ```mermaid block in the project docs, renders each one to an
 * SVG file via @mermaid-js/mermaid-cli (with ELK layout for flowcharts and
 * state diagrams), saves to docs/diagrams/, and replaces the fenced code
 * block in the markdown file with an <img> tag.
 *
 * The original Mermaid source is kept in an HTML comment so diagrams can be
 * edited and re-rendered without hunting through the markdown.
 *
 * Usage (first run):
 *   cd scripts && npm install
 *   node render-diagrams.mjs
 *
 * Re-rendering after editing a diagram source in the HTML comment:
 *   node scripts/render-diagrams.mjs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.join(__dirname, '..');
const DIAG_DIR = path.join(ROOT, 'docs', 'diagrams');
mkdirSync(DIAG_DIR, { recursive: true });

// Invoke mermaid-cli via node directly (avoids Windows .cmd bin-link issues)
const MMDC_CLI = path.join(__dirname, 'node_modules', '@mermaid-js', 'mermaid-cli', 'src', 'cli.js');

// Markdown files to process (relative to ROOT)
const FILES = [
  'README.md',
  'docs/ARCHITECTURE.md',
  'docs/DEPLOYMENT.md',
  'docs/USER_GUIDE.md',
];

// ── helpers ──────────────────────────────────────────────────────────────────

function filePrefix(relPath) {
  const base = path.basename(relPath, '.md');
  return (
    { README: 'readme', ARCHITECTURE: 'arch', DEPLOYMENT: 'deploy', USER_GUIDE: 'guide' }[base]
    ?? base.toLowerCase()
  );
}

function slug(text) {
  return text
    .replace(/^#+\s*/, '')
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function lastHeadingBefore(content, pos) {
  const before = content.slice(0, pos);
  const matches = [...before.matchAll(/^#{1,4}\s+(.+)$/gm)];
  return matches.length ? slug(matches.at(-1)[1]) : null;
}

// Detect diagram type from first non-comment, non-blank line
function diagramType(source) {
  const first = source.split('\n').find(l => l.trim() && !l.trim().startsWith('%%'));
  if (!first) return 'unknown';
  const t = first.trim().toLowerCase();
  if (t.startsWith('flowchart') || t.startsWith('graph ')) return 'flowchart';
  if (t.startsWith('sequencediagram'))                       return 'sequence';
  if (t.startsWith('statediagram'))                          return 'state';
  return 'other';
}

// Build a mermaid config JSON for a given diagram type.
// ELK produces significantly better layouts for flowcharts and state diagrams.
function buildConfig(type) {
  const base = {
    theme: 'neutral',
    themeVariables: {
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
      fontSize: '14px',
    },
  };

  if (type === 'flowchart') {
    base.layout = 'elk';
    base.flowchart = { defaultRenderer: 'elk', padding: 20 };
    base.elk = { mergeEdges: false, nodePlacementStrategy: 'LINEAR_SEGMENTS' };
  } else if (type === 'state') {
    base.layout = 'elk';
    base.state = { defaultRenderer: 'elk' };
  }

  return base;
}

// ── block finders ─────────────────────────────────────────────────────────────

function findBlocks(content) {
  // Record spans of already-rendered comments so we skip fences inside them
  const commentSpans = [];
  const COMMENT_RE = /<!-- mermaid-source\n[\s\S]*?-->/g;
  let c;
  while ((c = COMMENT_RE.exec(content)) !== null) {
    commentSpans.push([c.index, c.index + c[0].length]);
  }
  const insideComment = (pos) => commentSpans.some(([s, e]) => pos >= s && pos < e);

  const blocks = [];
  const FENCE_RE = /^```mermaid\r?\n([\s\S]*?)^```/gm;
  let m;
  while ((m = FENCE_RE.exec(content)) !== null) {
    if (!insideComment(m.index)) {
      blocks.push({ full: m[0], source: m[1], start: m.index, end: m.index + m[0].length });
    }
  }
  return blocks.sort((a, b) => a.start - b.start);
}

// ── main ─────────────────────────────────────────────────────────────────────

let totalOk = 0, totalFail = 0;

for (const relPath of FILES) {
  const absPath = path.join(ROOT, relPath);
  if (!existsSync(absPath)) { console.warn(`⚠  skip (not found): ${relPath}`); continue; }

  const content = readFileSync(absPath, 'utf8');
  const prefix  = filePrefix(relPath);
  const blocks  = findBlocks(content);

  if (blocks.length === 0) continue;
  console.log(`\n→ ${relPath} (${blocks.length} diagram${blocks.length > 1 ? 's' : ''})`);

  // ── assign unique SVG filenames ───────────────────────────────────────────
  const usedNames = new Set();
  for (const b of blocks) {
    const heading = lastHeadingBefore(content, b.start);
    let base = heading ? `${prefix}-${heading}` : prefix;
    let name = `${base}.svg`;
    let n = 2;
    while (usedNames.has(name)) name = `${base}-${n++}.svg`;
    usedNames.add(name);
    b.svgName = name;
  }

  // ── render each block ────────────────────────────────────────────────────
  const replacements = [];

  for (const b of blocks) {
    const type    = diagramType(b.source);
    const config  = buildConfig(type);
    const svgPath = path.join(DIAG_DIR, b.svgName);
    const tmp     = path.join(os.tmpdir(), `shit-diag-${process.pid}-${Date.now()}.mmd`);
    const cfgTmp  = path.join(os.tmpdir(), `shit-cfg-${process.pid}-${Date.now()}.json`);

    writeFileSync(tmp, b.source.trimEnd() + '\n');
    writeFileSync(cfgTmp, JSON.stringify(config));

    const altText = b.svgName.replace(/\.svg$/, '').replace(/-/g, ' ');
    const svgRel  = path.relative(path.dirname(absPath), svgPath).replace(/\\/g, '/');

    try {
      execSync(
        `node "${MMDC_CLI}" -i "${tmp}" -o "${svgPath}" --configFile "${cfgTmp}" --backgroundColor white`,
        { stdio: 'pipe' }
      );

      const replacement = `![${altText}](${svgRel})`;

      replacements.push({ start: b.start, end: b.end, replacement });
      console.log(`  ✓ ${b.svgName}  [${type}${type === 'flowchart' || type === 'state' ? ' / elk' : ''}]`);
      totalOk++;
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : '';
      const msg = stderr.split('\n').find(l => /error|Error|fail/i.test(l)) ?? err.message;
      console.error(`  ✗ ${b.svgName}: ${msg.trim()}`);
      totalFail++;
    }

    try { unlinkSync(tmp); } catch { /* ignore */ }
    try { unlinkSync(cfgTmp); } catch { /* ignore */ }
  }

  if (replacements.length === 0) continue;

  // Apply replacements in reverse order so earlier positions stay valid
  replacements.sort((a, b) => b.start - a.start);
  let newContent = content;
  for (const { start, end, replacement } of replacements) {
    newContent = newContent.slice(0, start) + replacement + newContent.slice(end);
  }

  writeFileSync(absPath, newContent);
  console.log(`  → ${relPath} updated`);
}

console.log(`\n${totalFail === 0 ? '✅' : '⚠️'}  ${totalOk} rendered, ${totalFail} failed\n`);
if (totalFail > 0) process.exit(1);
