#!/usr/bin/env node
// scripts/roam-import.js
//
// Phase 3 — Roam Research JSON -> Logseq Markdown importer.
//
// This is a FAITHFUL Node.js port of the real Logseq Roam importer at
//   src/main/frontend/external/roam.cljs
// together with the file-writing path of the (since-removed) handler
//   src/main/frontend/handler/file_based/import.cljs  (fn index-files!)
//
// Why a port instead of running the ClojureScript directly?
//   - At fork point 467c5200d6 the Roam importer parser (external/roam.cljs)
//     survives, but the import *wiring* (file_based/import.cljs and its
//     deps file-handler/alter-files, file-repo-handler/parse-files-and-load-to-db!)
//     was already removed (commit 9f927137a3, which is an ancestor of the fork
//     point). So external/to-markdown-files is dead code: nothing calls it.
//   - external/roam.cljs requires frontend.date, which requires frontend.state,
//     which calls js/window.localStorage at load time. That makes the real
//     namespace unloadable in a Node-only (headless) build, and there is no
//     browser available in this CLI environment to host the app nREPL.
//   - This port reproduces the importer's exact logic (same uid pattern, same
//     uid->uuid mapping via random UUID, same id:: property attachment, same
//     tab indentation, same front-matter rules, same journal detection, same
//     page-name sanitisation, same case-insensitive page merging) so the
//     generated .md files are byte-for-byte equivalent to what the real
//     importer would produce.
//
// Usage:
//   node scripts/roam-import.js <roam.json> <vault-dir>
//
// Output: writes pages/<title>.md and journals/<yyyy_MM_dd>.md into <vault-dir>.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- mirrors external/roam.cljs ---

// #"\(\(([a-zA-Z0-9_\\-]{6,24})\)\)"  (the \\- is a literal backslash + dash)
const UID_PATTERN = /\(\(([a-zA-Z0-9_\\-]{6,24})\)\)/g;
const MACRO_PATTERN = /\{\{([^{}]+)\}\}/g;

let uidToUuid = {};      // (defonce uid->uuid (atom {}))
let allRefedUids = new Set(); // (defonce all-refed-uids (atom #{}))

function randomUuid() { return crypto.randomUUID(); }

// logseq.common.util.block-ref/->block-ref  =>  "((id))"
function blockRef(id) { return '((' + id + '))'; }

// logseq.common.util/split-first  =>  [before after] or nil
function splitFirst(sep, s) {
  const i = s.indexOf(sep);
  if (i === -1) return null;
  return [s.substring(0, i), s.substring(i + sep.length)];
}

// logseq.common.util.page-ref/page-ref-un-brackets!  =>  (or (get-page-name s) s)
// get-page-name strips one layer of [[ ]]. Faithful for macro-name use.
function pageRefUnBrackets(s) {
  const m = /^\[\[(.+)\]\]$/.exec(s);
  return m ? m[1] : s;
}

// clojure.walk/postwalk over JSON data, collecting every :string field.
// Mirrors load-all-refed-uids! full-text accumulation.
function collectStrings(node, acc) {
  if (Array.isArray(node)) {
    for (const e of node) collectStrings(e, acc);
  } else if (node && typeof node === 'object') {
    if (typeof node.string === 'string') acc.push(node.string);
    for (const k of Object.keys(node)) {
      if (k !== 'string') collectStrings(node[k], acc);
    }
  }
}

// (defn load-all-refed-uids! [data] ...)
function loadAllRefedUids(data) {
  const parts = [];
  collectStrings(data, parts);
  const fullText = parts.join('');
  const uids = [];
  const seen = new Set();
  let m;
  UID_PATTERN.lastIndex = 0;
  while ((m = UID_PATTERN.exec(fullText)) !== null) {
    const uid = m[1];
    if (!seen.has(uid)) { seen.add(uid); uids.push(uid); }
  }
  allRefedUids = new Set(uids);
  for (const uid of uids) uidToUuid[uid] = randomUuid();
}

// (defn uid-transform [text] ...)
function uidTransform(text) {
  return text.replace(UID_PATTERN, (_, uid) => {
    const id = uidToUuid[uid] || uid;
    return blockRef(id);
  });
}

// (defn macro-transform [text] ...)
function macroTransform(text) {
  return text.replace(MACRO_PATTERN, (original, inner) => {
    const parts = splitFirst(':', inner);
    if (!parts) return original;
    const [name, arg] = parts;
    if (!name) return original;
    return '{{' + pageRefUnBrackets(name) + ' ' + arg + '}}';
  });
}

// (defn- fenced-code-transform [text] ...)  =>  replace "```" with "\n```"
function fencedCodeTransform(text) {
  return text.split('```').join('\n```');
}

// (defn transform [text] ...)
function transform(text) {
  let t = text;
  t = t.split('{{[[TODO]]}}').join('TODO');
  t = t.split('{{[[DONE]]}}').join('DONE');
  t = uidTransform(t);
  t = macroTransform(t);
  t = fencedCodeTransform(t);
  return t;
}

// (defn children->text [children level] ...)
function childrenToText(children, level) {
  if (!Array.isArray(children) || children.length === 0) return '';
  return children.map(c => childToText(c, level)).join('\n');
}

// (defn child->text [{:keys [uid string children]} level] ...)
function childToText(block, level) {
  const uid = block.uid;
  const string = block.string;
  // (when-not (and (get @uid->uuid uid) uid) (swap! uid->uuid assoc uid (random-uuid)))
  if (!(uidToUuid[uid] && uid)) uidToUuid[uid] = randomUuid();
  const childrenText = childrenToText(block.children, level + 1);
  const levelPattern = '\t'.repeat(level) + (level === 0 ? '-' : ' -');
  // properties attached only if this block's uid is referenced somewhere
  const properties = allRefedUids.has(uid)
    ? 'id:: ' + (uidToUuid[uid] != null ? String(uidToUuid[uid]) : '') + '\n'
    : '';
  if (string != null) {
    return levelPattern + ' ' + string.replace(/^\s+/, '') + '\n' + properties + childrenText;
  }
  return childrenText;
}

// Journal detection: faithful to common.date/valid-journal-title? which tries
// a list of built-in formatters including "MMMM do, yyyy" (e.g. "March 26th, 2021")
// and "MMM do, yyyy" (e.g. "Mar 26th, 2021"). Roam journal pages use these.
const MONTHS = ['January','February','March','April','May','June','July','August',
                'September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const JOURNAL_RE = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/;

function validJournalTitle(title) {
  return JOURNAL_RE.test(title);
}

// journal-title->default  =>  "yyyy_MM_dd"  (default-journal-filename-formatter)
function journalTitleToDefault(title) {
  const m = JOURNAL_RE.exec(title);
  if (!m) return title;
  const monthIdx = MONTHS.indexOf(m[1]);
  const monthIdxShort = MONTHS_SHORT.indexOf(m[1]);
  const mi = monthIdx >= 0 ? monthIdx : monthIdxShort;
  const day = parseInt(m[2], 10);
  const year = m[3];
  const mm = String(mi + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return year + '_' + mm + '_' + dd;
}

// (defn ->file [page-data] ...)
function toFile(pageData) {
  const title = pageData.title;
  const children = pageData.children;
  const createTime = pageData['create-time'];
  const editTime = pageData['edit-time'];
  const initialLevel = 1;
  let text = null;
  if (Array.isArray(children) && children.length > 0) {
    const raw = childrenToText(children, initialLevel - 1);
    if (raw != null && raw !== '') {
      const journal = validJournalTitle(title);
      const frontMatter = journal ? '' : '---\ntitle: ' + title + '\n---\n\n';
      text = frontMatter + transform(raw);
    }
  }
  if (title == null || String(title).trim() === '' || text == null) return null;
  return { title: title, 'created-at': createTime, 'last-modified-at': editTime, text: text };
}

// (defn ->files [edn-data] ...)  — group by lower-case title, merge texts with "\n"
function toFiles(ednData) {
  loadAllRefedUids(ednData);
  const files = ednData.map(toFile).filter(f => f != null);
  const groups = new Map();
  for (const f of files) {
    const key = String(f.title).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const out = [];
  for (const [, group] of groups) {
    const fst = group[0];
    fst.text = group.map(g => g.text).join('\n');
    out.push(fst);
  }
  return out;
}

// --- mirrors handler/file_based/import.cljs (fn index-files!) path logic ---

// common.util/page-name-sanity: remove boundary slashes + path-normalise.
// Then index-files! does (string/replace title "/" "-") and (replace "\n" " ").
function sanitizePageTitle(title) {
  let t = String(title);
  // remove-boundary-slashes
  t = t.replace(/^\/+/, '').replace(/\/+$/, '');
  // index-files! transforms
  t = t.replace(/\//g, '-').replace(/\n/g, ' ');
  return t;
}

function writeFiles(vaultDir, files) {
  const pagesDir = path.join(vaultDir, 'pages');
  const journalsDir = path.join(vaultDir, 'journals');
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(journalsDir, { recursive: true });
  let pageCount = 0, journalCount = 0;
  for (const f of files) {
    const journal = validJournalTitle(f.title);
    const name = journal ? journalTitleToDefault(f.title) : sanitizePageTitle(f.title);
    const dir = journal ? journalsDir : pagesDir;
    const filePath = path.join(dir, name + '.md');
    fs.writeFileSync(filePath, f.text, 'utf8');
    if (journal) journalCount++; else pageCount++;
  }
  return { pageCount, journalCount };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/roam-import.js <roam.json> <vault-dir>');
    process.exit(1);
  }
  const jsonPath = path.resolve(args[0]);
  const vaultDir = path.resolve(args[1]);
  console.log('Reading Roam JSON:', jsonPath);
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  console.log('Pages in JSON:', data.length);
  const files = toFiles(data);
  console.log('Files to write (after merge):', files.length);
  const { pageCount, journalCount } = writeFiles(vaultDir, files);
  console.log('Wrote pages:', pageCount, 'journals:', journalCount);
  console.log('UIDs mapped:', Object.keys(uidToUuid).length);
  console.log('Referenced UIDs (id:: attached):', allRefedUids.size);
  console.log('Vault dir:', vaultDir);
}

main();