import { Character } from '../../../types';

const normalizeName = (name: string) => (name || '').trim().toLowerCase();

export const isProtectedCharacterName = (name: string) => {
  const n = normalizeName(name);
  // Keep in sync with other parts of the app that treat these as special/system roles.
  return n === '[静音]' || n === '静音' || n === '[音效]' || n === '音效' || n === 'sfx' || n === 'narrator';
};

export interface FindMergeTargetResult {
  target: Character | null;
  reason?: 'no_match' | 'multiple_matches' | 'unsafe_scope' | 'protected_name';
  matches?: Character[];
}

/**
 * Find a safe merge target when user renames a character to an existing name.
 *
 * Safety rule: only allow merging into a target with the SAME projectId scope
 * (both project-scoped to the same project, or both global).
 *
 * This avoids reassigning lines in other projects to a project-scoped target
 * that would be invisible / invalid in those projects.
 */
export function findSafeMergeTargetForRename(
  allCharacters: Character[],
  source: Character,
  desiredName: string,
): FindMergeTargetResult {
  if (isProtectedCharacterName(desiredName) || isProtectedCharacterName(source.name)) {
    return { target: null, reason: 'protected_name' };
  }

  const desiredKey = normalizeName(desiredName);
  if (!desiredKey) return { target: null, reason: 'no_match' };

  const sourceScope = source.projectId || null;
  const candidates = allCharacters.filter((c) => {
    if (c.id === source.id) return false;
    if ((c.status || 'active') === 'merged') return false;
    return normalizeName(c.name) === desiredKey;
  });

  if (candidates.length === 0) return { target: null, reason: 'no_match' };

  const safeScopeMatches = candidates.filter((c) => (c.projectId || null) === sourceScope);
  if (safeScopeMatches.length === 0) {
    return { target: null, reason: 'unsafe_scope', matches: candidates };
  }

  if (safeScopeMatches.length > 1) {
    return { target: null, reason: 'multiple_matches', matches: safeScopeMatches };
  }

  return { target: safeScopeMatches[0] };
}

