import {
  collection,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { postJson, getJson } from '../api/httpClient';
import { NetworkMember } from '../types';

export interface DirectoryMember {
  memberId: string;
  userId: string;
  username: string;
  accountStatus: 'active' | 'non-active';
  memberStatus?: 'active' | 'suspended' | 'closed';
  licenseStatus?: 'none' | 'active' | 'suspended' | 'expired';
  vipTier?: string;
  emailMasked: string;
  sponsorId?: string;
  sponsorName?: string;
  joinedAt: string;
  role?: string;
}

export function isValidMemberId(value: unknown): value is string {
  return typeof value === 'string' && /^GN-\d{5}$/.test(value);
}

/** Reserve a permanent sequential ID. The counter transaction serializes concurrent registrations. */
export async function reserveMemberId(userId: string): Promise<string> {
  if (!auth.currentUser || auth.currentUser.uid !== userId) throw new Error('Sesi Firebase tidak tersedia.');
  const token = await auth.currentUser.getIdToken();
  const result = await postJson<{ success: true; memberId: string }>('/api/account/reserve-member-id', {}, undefined, token);
  return result.memberId;
}

/**
 * Look up member in directory by Member ID (e.g. "GN-00001").
 */
export async function lookupMemberInDirectory(
  memberIdInput: string
): Promise<DirectoryMember | null> {
  const cleanId = memberIdInput.trim().toUpperCase();
  if (!cleanId) return null;

  try {
    const dirRef = doc(db, 'member_directory', cleanId);
    const snap = await getDoc(dirRef);
    if (snap.exists()) {
      return snap.data() as DirectoryMember;
    }
  } catch {
    // Return null if not found
  }

  return null;
}


export async function fetchDirectReferrals(): Promise<NetworkMember[]> {
  if (!auth.currentUser) return [];
  const token = await auth.currentUser.getIdToken();
  const result = await getJson<{ success:boolean; members:Array<any> }>('/api/referrals/direct', token);
  return result.members.map((m) => ({
    id: String(m.memberId),
    memberId: String(m.memberId),
    name: String(m.username || 'Member'),
    emailMasked: '',
    sponsorId: '',
    joinDate: String(m.joinedAt || ''),
    accountStatus: m.accountStatus === 'active' ? 'active' : 'non-active',
    ...(m.memberStatus ? { memberStatus: m.memberStatus } : {}),
    ...(m.licenseStatus ? { licenseStatus: m.licenseStatus } : {}),
    ...(typeof m.bonusYieldUsdt === 'number' ? { bonusYieldUsdt: m.bonusYieldUsdt } : {}),
  }));
}

/** Subscribe to real direct referrals from the authoritative PostgreSQL API. */
export function subscribeToDirectReferrals(userId: string | undefined, _userMemberId: string, onUpdate: (members: NetworkMember[]) => void, onError: () => void): () => void {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId || userId.startsWith('gain-usr-')) { onUpdate([]); return () => {}; }
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fetch = async () => {
    if (disposed) return;
    try { onUpdate(await fetchDirectReferrals()); }
    catch { onError(); }
    if (!disposed) timer = setTimeout(fetch, 10000);
  };
  void fetch();
  return () => { disposed = true; if (timer) clearTimeout(timer); };
}

export function subscribeToMemberDirectory(
  onUpdate: (members: DirectoryMember[]) => void,
  onError: () => void,
): () => void {
  return onSnapshot(query(collection(db, 'member_directory'), limit(200)), (snapshot) => {
    onUpdate(snapshot.docs.map((memberDoc) => ({ ...memberDoc.data(), memberId: memberDoc.id }) as DirectoryMember));
  }, onError);
}
