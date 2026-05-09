import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const root = process.cwd();
const moduleUrl = pathToFileURL(path.join(root, 'src/plaud-vault.ts')).href;
const {upsertPlaudNote, buildPlaudFilename} = await import(moduleUrl);

function createMockVault(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const createdFolders = [];
  const writes = [];
  const creates = [];
  const renames = [];

  return {
    files,
    createdFolders,
    writes,
    creates,
    renames,
    async ensureFolder(path) {
      createdFolders.push(path);
    },
    async listMarkdownFiles(folder) {
      return [...files.keys()].filter((key) => key.startsWith(folder) && key.endsWith('.md'));
    },
    async read(path) {
      return files.get(path) ?? '';
    },
    async write(path, content) {
      writes.push(path);
      files.set(path, content);
    },
    async create(path, content) {
      creates.push(path);
      files.set(path, content);
    },
    async rename(oldPath, newPath) {
      renames.push({oldPath, newPath});
      const content = files.get(oldPath);
      if (content !== undefined) {
        files.delete(oldPath);
        files.set(newPath, content);
      }
    },
    getFrontmatterFileId(path) {
      // Mock implementation: extract file_id from frontmatter
      const content = files.get(path);
      if (!content) return null;
      
      const match = content.match(/^---\n[\s\S]*?file_id:\s*"?([^"\n]+)"?[\s\S]*?\n---/);
      return match ? match[1].trim() : null;
    }
  };
}

test('buildPlaudFilename is deterministic and slug-safe', () => {
  const filename = buildPlaudFilename({
    filenamePattern: 'plaud-{date}-{title}',
    date: '2024-11-04',
    title: 'Weekly Sync: Team / Product'
  });

  assert.equal(filename, 'plaud-2024-11-04-weekly-sync-team-product.md');
});

test('buildPlaudFilename substitutes {year} from date prefix', () => {
  const filename = buildPlaudFilename({
    filenamePattern: '{year}/plaud-{date}-{title}',
    date: '2024-11-04',
    title: 'Weekly Sync'
  });

  assert.equal(filename, '2024-plaud-2024-11-04-weekly-sync.md');
});

test('buildPlaudFilename supports {year} alone without {date}', () => {
  const filename = buildPlaudFilename({
    filenamePattern: '{year}-{title}',
    date: '2024-11-04',
    title: 'Annual Review'
  });

  assert.equal(filename, '2024-annual-review.md');
});

test('buildPlaudFilename {year} falls back gracefully for malformed dates', () => {
  const filename = buildPlaudFilename({
    filenamePattern: '{year}-{title}',
    date: 'not-a-date',
    title: 'Test'
  });

  assert.equal(filename, 'not-a-date-test.md');
});

test('creates sync folder and new note when no existing file_id match', async () => {
  const vault = createMockVault();

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: true,
    fileId: 'f_001',
    title: 'First Note',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_001\n---\n\n# First Note\n'
  });

  assert.equal(result.action, 'created');
  assert.equal(result.path, 'Plaud/plaud-2024-11-04-first-note.md');
  assert.deepEqual(vault.createdFolders, ['Plaud']);
  assert.deepEqual(vault.creates, ['Plaud/plaud-2024-11-04-first-note.md']);
});

test('matches existing note by frontmatter file_id and updates in place', async () => {
  const vault = createMockVault({
    'Plaud/plaud-2024-11-04-updated-title.md': '---\nfile_id: f_abc\n---\n\nold'
  });

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: true,
    fileId: 'f_abc',
    title: 'Updated title',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_abc\n---\n\nnew'
  });

  assert.equal(result.action, 'updated');
  assert.equal(result.path, 'Plaud/plaud-2024-11-04-updated-title.md');
  assert.deepEqual(vault.writes, ['Plaud/plaud-2024-11-04-updated-title.md']);
  assert.equal(vault.creates.length, 0);
});

test('matches existing note when frontmatter file_id is quoted', async () => {
  const vault = createMockVault({
    'Plaud/plaud-2024-11-04-quoted-match.md': '---\nfile_id: "f_quoted"\n---\n\nold'
  });

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: true,
    fileId: 'f_quoted',
    title: 'Quoted match',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_quoted\n---\n\nnew'
  });

  assert.equal(result.action, 'updated');
  assert.equal(result.path, 'Plaud/plaud-2024-11-04-quoted-match.md');
  assert.deepEqual(vault.writes, ['Plaud/plaud-2024-11-04-quoted-match.md']);
  assert.equal(vault.creates.length, 0);
});

test('skips update when updateExisting=false but still resolves by file_id', async () => {
  const vault = createMockVault({
    'Plaud/existing.md': '---\nfile_id: f_skip\n---\n\nold'
  });

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: false,
    fileId: 'f_skip',
    title: 'Ignored title',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_skip\n---\n\nnew'
  });

  assert.equal(result.action, 'skipped');
  assert.equal(result.path, 'Plaud/existing.md');
  assert.equal(vault.writes.length, 0);
  assert.equal(vault.creates.length, 0);
});

test('applies collision-safe filename fallback for new notes', async () => {
  const vault = createMockVault({
    'Plaud/plaud-2024-11-04-first-note.md': '---\nfile_id: old\n---',
    'Plaud/plaud-2024-11-04-first-note-2.md': '---\nfile_id: old2\n---'
  });

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: true,
    fileId: 'f_new',
    title: 'First Note',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_new\n---\n\nnew'
  });

  assert.equal(result.action, 'created');
  assert.equal(result.path, 'Plaud/plaud-2024-11-04-first-note-3.md');

test('sanitizes folder names by removing invalid filesystem characters', async () => {
  const vault = createMockVault();

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: true,
    fileId: 'f_sanitize',
    title: 'Test Note',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_sanitize\n---\n\nContent',
    folderName: 'Work:Projects/Q4<2024>'
  });

  assert.equal(result.action, 'created');
  assert.equal(result.path, 'Plaud/Work-Projects-Q4-2024-/plaud-2024-11-04-test-note.md');
  // ensureFolder is called for both base and subfolder
  assert.ok(vault.createdFolders.includes('Plaud/Work-Projects-Q4-2024-'));
});

test('creates notes in subfolders when folderName is provided', async () => {
  const vault = createMockVault();

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: true,
    fileId: 'f_folder',
    title: 'Meeting Notes',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_folder\n---\n\nContent',
    folderName: 'Work Meetings'
  });

  assert.equal(result.action, 'created');
  assert.equal(result.path, 'Plaud/Work Meetings/plaud-2024-11-04-meeting-notes.md');
  // ensureFolder is called for both base and subfolder
  assert.ok(vault.createdFolders.includes('Plaud/Work Meetings'));
});

test('moves existing note to correct folder when folder changes', async () => {
  const vault = createMockVault({
    'Plaud/Old Folder/plaud-2024-11-04-moved-note.md': '---\nfile_id: f_move\n---\n\nold'
  });

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: true,
    fileId: 'f_move',
    title: 'Moved Note',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_move\n---\n\nnew',
    folderName: 'New Folder'
  });

  assert.equal(result.action, 'renamed');
  assert.equal(result.path, 'Plaud/New Folder/plaud-2024-11-04-moved-note.md');
  assert.equal(result.oldPath, 'Plaud/Old Folder/plaud-2024-11-04-moved-note.md');
  assert.deepEqual(vault.renames, [{
    oldPath: 'Plaud/Old Folder/plaud-2024-11-04-moved-note.md',
    newPath: 'Plaud/New Folder/plaud-2024-11-04-moved-note.md'
  }]);
});

test('renames file when title changes but folder stays same', async () => {
  const vault = createMockVault({
    'Plaud/Meetings/plaud-2024-11-04-old-title.md': '---\nfile_id: f_rename\n---\n\nold'
  });

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: true,
    fileId: 'f_rename',
    title: 'New Title',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_rename\n---\n\nnew',
    folderName: 'Meetings'
  });

  assert.equal(result.action, 'renamed');
  assert.equal(result.path, 'Plaud/Meetings/plaud-2024-11-04-new-title.md');
  assert.equal(result.oldPath, 'Plaud/Meetings/plaud-2024-11-04-old-title.md');
});

test('updates in place when folder and filename match', async () => {
  const vault = createMockVault({
    'Plaud/Projects/plaud-2024-11-04-same-note.md': '---\nfile_id: f_same\n---\n\nold'
  });

  const result = await upsertPlaudNote({
    vault,
    syncFolder: 'Plaud',
    filenamePattern: 'plaud-{date}-{title}',
    updateExisting: true,
    fileId: 'f_same',
    title: 'Same Note',
    date: '2024-11-04',
    markdown: '---\nfile_id: f_same\n---\n\nnew',
    folderName: 'Projects'
  });

  assert.equal(result.action, 'updated');
  assert.equal(result.path, 'Plaud/Projects/plaud-2024-11-04-same-note.md');
  assert.equal(vault.renames.length, 0);
  assert.deepEqual(vault.writes, ['Plaud/Projects/plaud-2024-11-04-same-note.md']);
});
});
