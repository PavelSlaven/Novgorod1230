import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDiagnosticsVisible, shouldAutoOpenDiagnosticsDrawer } from '../src/ui/diagnostics-visibility.js';

test('diagnostics stay hidden outside debug mode when process is healthy', () => {
  assert.equal(resolveDiagnosticsVisible(false), false);
  assert.equal(resolveDiagnosticsVisible(false, { processError: false }), false);
  assert.equal(shouldAutoOpenDiagnosticsDrawer(false), false);
  assert.equal(shouldAutoOpenDiagnosticsDrawer(false, { processError: false }), false);
});

test('diagnostics stay available in debug mode', () => {
  assert.equal(resolveDiagnosticsVisible(true), true);
  assert.equal(shouldAutoOpenDiagnosticsDrawer(true), true);
});

test('diagnostics unlock on process error without debug mode', () => {
  assert.equal(resolveDiagnosticsVisible(false, { processError: true }), true);
  assert.equal(shouldAutoOpenDiagnosticsDrawer(false, { processError: true }), true);
});

test('diagnostics unlock when snapshot marks diagnosticsVisible', () => {
  assert.equal(resolveDiagnosticsVisible(false, { diagnosticsVisible: true }), true);
});
