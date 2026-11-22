import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowsThemeAction, planThemeTransition, type ThemeAction, type ProjectRole } from '../src/projects/lifecycle.js';
import { parseColor } from '../src/color/parse.js';
import { themeRoleKeys, type ThemeRole } from '../src/projects/snapshot.js';

const actions: readonly ThemeAction[] = ['read', 'export', 'edit', 'release', 'withdraw', 'manage-members',
  'archive', 'restore-archive', 'restore-revision'];
test('theme permission matrix distinguishes viewer, editor, owner and absent membership', () => {
  const permissions: Record<ProjectRole, readonly ThemeAction[]> = {
    owner: actions, editor: ['read', 'export', 'edit', 'restore-revision'], viewer: ['read', 'export'],
  };
  for (const role of ['owner', 'editor', 'viewer'] as const) {
    for (const action of actions) assert.equal(allowsThemeAction(role, action), permissions[role].includes(action), role + ' ' + action);
  }
  assert.equal(allowsThemeAction(null, 'read'), false);
});

test('theme release defaults to project and validates scoped ownership, version and all role bindings', () => {
  const scope = { organizationId: 'tenant', projectId: 'project' };
  const state = { ...scope, version: '12', headRevision: 5, archived: false, activeReleaseId: 'active' };
  const owner = { ...scope, role: 'owner' as const };
  const snapshot = { swatches: [{ id: 'a', color: parseColor('#345') }],
    roles: Object.fromEntries(themeRoleKeys.map(key => [key, 'a'])) as Record<ThemeRole, string> };
  const release = { type: 'release' as const, expectedVersion: '12', revision: 3, snapshot };
  assert.deepEqual(planThemeTransition(owner, state, release),
    { status: 'allowed', plan: { type: 'release', revision: 3, audience: 'project', withdrawReleaseId: 'active' } });
  assert.deepEqual(planThemeTransition({ ...owner, projectId: 'other' }, state, release), { status: 'unavailable' });
  assert.deepEqual(planThemeTransition({ ...owner, organizationId: 'other' }, state, release), { status: 'unavailable' });
  assert.deepEqual(planThemeTransition({ ...owner, role: 'editor' }, state, release), { status: 'unavailable' });
  assert.deepEqual(planThemeTransition(owner, state, { ...release, expectedVersion: '11' }), { status: 'stale', version: '12' });
  assert.deepEqual(planThemeTransition(owner, state, { ...release, audience: 'public' }), { status: 'invalid' });
  assert.equal(planThemeTransition(owner, state, { ...release, audience: 'public', confirmPublic: true }).status, 'allowed');
  assert.deepEqual(planThemeTransition(owner, state, { ...release, snapshot: { ...snapshot, roles: {} } }), { status: 'invalid' });
});

test('restoring a revision creates a separate draft and restoring an archive leaves releases withdrawn', () => {
  const scope = { organizationId: 'tenant', projectId: 'project' };
  const owner = { ...scope, role: 'owner' as const };
  const state = { ...scope, version: '12', headRevision: 5, archived: false, activeReleaseId: 'active' };
  const snapshot = { swatches: [{ id: 'a', color: parseColor('#345') }], roles: { 'tile.text': 'a' } };
  const restored = planThemeTransition({ ...owner, role: 'editor' }, state,
    { type: 'restore-revision', expectedVersion: '12', revision: 2, snapshot });
  assert.equal(restored.status, 'allowed');
  if (restored.status !== 'allowed' || restored.plan.type !== 'restore-revision') assert.fail();
  assert.equal(restored.plan.draftRevision, 6);
  assert.equal(restored.plan.sourceRevision, 2);
  assert.deepEqual(restored.plan.snapshot, snapshot);
  assert.notEqual(restored.plan.snapshot.swatches[0]?.color, snapshot.swatches[0]?.color);
  assert.equal(state.activeReleaseId, 'active');
  const archive = planThemeTransition(owner, state, { type: 'archive', expectedVersion: '12' });
  assert.deepEqual(archive, { status: 'allowed', plan: { type: 'archive', withdrawReleaseId: 'active' } });
  assert.deepEqual(planThemeTransition(owner, { ...state, archived: true, activeReleaseId: null },
    { type: 'restore-archive', expectedVersion: '12' }), { status: 'allowed', plan: { type: 'restore-archive', activeReleaseId: null } });
  assert.deepEqual(planThemeTransition(owner, state, { type: 'withdraw', expectedVersion: '12', releaseId: 'superseded' }), { status: 'conflict' });
});
