import { themeRoleKeys, themeSnapshot, type ThemeSnapshot } from './snapshot.js';

export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type ThemeAction = 'read' | 'export' | 'edit' | 'release' | 'withdraw' | 'manage-members' |
  'archive' | 'restore-archive' | 'restore-revision';

const permissions: Record<ThemeAction, readonly ProjectRole[]> = {
  read: ['owner', 'editor', 'viewer'],
  export: ['owner', 'editor', 'viewer'],
  edit: ['owner', 'editor'],
  'restore-revision': ['owner', 'editor'],
  release: ['owner'],
  withdraw: ['owner'],
  'manage-members': ['owner'],
  archive: ['owner'],
  'restore-archive': ['owner'],
};
export function allowsThemeAction(role: ProjectRole | null, action: ThemeAction) {
  return role !== null && permissions[action].includes(role);
}

type Scope = Readonly<{ organizationId: string; projectId: string }>;
type ThemeState = Scope & Readonly<{ version: string; headRevision: number; archived: boolean; activeReleaseId: string | null }>;
type Audience = 'project' | 'public';
type ThemeTransition = { expectedVersion: string } & (
  { type: 'release'; revision: number; snapshot: ThemeSnapshot | null; audience?: Audience; confirmPublic?: boolean } |
  { type: 'withdraw'; releaseId: string } |
  { type: 'archive' } | { type: 'restore-archive' } |
  { type: 'restore-revision'; revision: number; snapshot: ThemeSnapshot }
);
type ThemePlan =
  { type: 'release'; revision: number; audience: Audience; withdrawReleaseId: string | null } |
  { type: 'withdraw' | 'archive'; withdrawReleaseId: string | null } |
  { type: 'restore-archive'; activeReleaseId: null } |
  { type: 'restore-revision'; sourceRevision: number; draftRevision: number; snapshot: ThemeSnapshot };
type Decision = { status: 'allowed'; plan: ThemePlan } | { status: 'stale'; version: string } |
  { status: 'unavailable' | 'invalid' | 'conflict' };

export function planThemeTransition(membership: Scope & { role: ProjectRole | null }, state: ThemeState, input: ThemeTransition): Decision {
  if (membership.organizationId !== state.organizationId || membership.projectId !== state.projectId ||
      !allowsThemeAction(membership.role, input.type)) return { status: 'unavailable' };
  if (state.version !== input.expectedVersion) return { status: 'stale', version: state.version };
  if (input.type === 'restore-archive') return state.archived
    ? { status: 'allowed', plan: { type: 'restore-archive', activeReleaseId: null } } : { status: 'conflict' };
  if (state.archived) return { status: 'unavailable' };
  if (input.type === 'archive') return { status: 'allowed', plan: { type: 'archive', withdrawReleaseId: state.activeReleaseId } };
  if (input.type === 'withdraw') return state.activeReleaseId === input.releaseId
    ? { status: 'allowed', plan: { type: 'withdraw', withdrawReleaseId: state.activeReleaseId } } : { status: 'conflict' };
  if (!Number.isInteger(input.revision) || input.revision < 1 || input.revision > state.headRevision || !input.snapshot) {
    return { status: 'invalid' };
  }
  let snapshot: ThemeSnapshot;
  try { snapshot = themeSnapshot(input.snapshot); } catch { return { status: 'invalid' }; }
  if (input.type === 'restore-revision') return { status: 'allowed', plan: {
    type: 'restore-revision', sourceRevision: input.revision, draftRevision: state.headRevision + 1, snapshot,
  } };
  const audience = input.audience ?? 'project';
  if ((audience !== 'project' && (audience !== 'public' || input.confirmPublic !== true)) ||
      !themeRoleKeys.every(role => snapshot.roles[role])) return { status: 'invalid' };
  return { status: 'allowed', plan: { type: 'release', revision: input.revision, audience, withdrawReleaseId: state.activeReleaseId } };
}
