import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSession } from '../server/session.js';

test('room links survive restart and private storage rejects corrupt sessions', t => {
  const dir = mkdtempSync(join(tmpdir(), 'office-session-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = loadSession(dir), b = loadSession(dir);
  assert.deepEqual(a, b); assert.notEqual(a.hostToken, a.joinToken);
  assert.equal(a.joinToken.length, 48);
  assert.equal(statSync(join(dir, 'session.json')).mode & 0o777, 0o600);
  writeFileSync(join(dir, 'session.json'), '{}');
  assert.throws(() => loadSession(dir));
});
