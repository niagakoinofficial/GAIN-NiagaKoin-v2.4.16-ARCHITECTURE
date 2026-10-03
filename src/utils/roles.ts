import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export const USER_ROLES = ['member', 'support', 'admin', 'super_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function normalizeRole(role?: string | null): UserRole {
  if (!role) return 'member';
  const normalized = role.toString().trim().toLowerCase();
  if (normalized === 'super_admin' || normalized === 'superadmin') return 'super_admin';
  if (normalized === 'admin' || normalized === 'administrator') return 'admin';
  if (normalized === 'support' || normalized === 'support_user') return 'support';
  return 'member';
}

export function isAdminRole(role?: string | null): boolean {
  const normalized = normalizeRole(role);
  return normalized === 'admin' || normalized === 'super_admin';
}

export async function resolveCurrentUserRole(): Promise<UserRole> {
  try {
    const tokenResult = auth.currentUser ? await auth.currentUser.getIdTokenResult() : null;
    const tokenRole = tokenResult?.claims?.admin === true ? 'admin' : normalizeRole((tokenResult?.claims?.role as string | undefined) || null);
    if (tokenRole !== 'member' || !auth.currentUser) {
      return tokenRole;
    }

    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (snap.exists()) {
      return normalizeRole((snap.data()?.role as string | undefined) || null);
    }
  } catch {
    // Ignore custom-claim resolution failures and fall back to the persisted member role.
  }

  return 'member';
}
