import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, signInWithGoogle, signOutUser } from '../firebase';
import { initUserProfile } from '../repositories/userRepository';
import { resolveCurrentUserRole } from '../utils/roles';
import { reportClientEvent } from '../services/observabilityService';
import { isDemoMode } from '../config/appMode';
import { clearElevatedSession } from '../api/authApi';

type FirebaseConnectionStatus = 'checking' | 'connected' | 'error';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  loginWithGoogle: (registrationData?: { sponsorId?: string; sponsorName?: string; desiredUsername?: string }) => Promise<void>;
  loginDirectly: (email: string, registrationData?: { sponsorId?: string; sponsorName?: string; desiredUsername?: string }) => Promise<void>;
  retryUserProfileSync: () => Promise<void>;
  logout: () => Promise<void>;
  firebaseConnectionStatus: FirebaseConnectionStatus;
  isLoggingIn: boolean;
  isAdmin: boolean;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  authModalMode: 'login' | 'register';
  setAuthModalMode: (mode: 'login' | 'register') => void;
  pendingSponsorId: string;
  setPendingSponsorId: (id: string) => void;
  openLogin: () => void;
  openRegister: (sponsorId?: string) => void;
  authError: { code?: string; message: string } | null;
  clearAuthError: () => void;
}



async function checkGainAccountProvisioned(user: User): Promise<{
  registered: boolean;
  memberStatus?: 'active' | 'suspended' | 'closed';
}> {
  const token = await user.getIdToken();

  const response = await fetch('/api/account/state', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 404) return { registered: false };

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // Keep the HTTP-status error below.
  }

  if (response.ok) {
    const memberStatus = body?.wallet?.member_status || body?.wallet?.status;
    return {
      registered: true,
      memberStatus: memberStatus === 'suspended' || memberStatus === 'closed' ? memberStatus : 'active',
    };
  }

  const code = typeof body?.code === 'string' ? body.code : '';
  const message = typeof body?.message === 'string' && body.message.trim()
    ? body.message
    : `Status akun GAIN gagal diperiksa (${response.status}).`;

  throw Object.assign(new Error(message), {
    code: code || 'ACCOUNT_STATE_CHECK_FAILED',
    memberStatus: body?.wallet?.member_status || body?.wallet?.status,
  });
}

function enforceActiveMemberState(result: { registered: boolean; memberStatus?: 'active' | 'suspended' | 'closed' }) {
  if (!result.registered) return;
  if (result.memberStatus === 'suspended') {
    throw Object.assign(new Error('Akun GAIN sedang ditangguhkan oleh administrator.'), { code: 'MEMBER_SUSPENDED' });
  }
  if (result.memberStatus === 'closed') {
    throw Object.assign(new Error('Akun GAIN sudah ditutup.'), { code: 'MEMBER_CLOSED' });
  }
}


const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
  loginWithGoogle: async () => {},
  loginDirectly: async () => {},
  retryUserProfileSync: async () => {},
  logout: async () => {},
  firebaseConnectionStatus: 'checking',
  isLoggingIn: false,
  isAdmin: false,
  isAuthModalOpen: false,
  setIsAuthModalOpen: () => {},
  authModalMode: 'login',
  setAuthModalMode: () => {},
  pendingSponsorId: '',
  setPendingSponsorId: () => {},
  openLogin: () => {},
  openRegister: () => {},
  authError: null,
  clearAuthError: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [firebaseConnectionStatus, setFirebaseConnectionStatus] = useState<FirebaseConnectionStatus>('checking');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [pendingSponsorId, setPendingSponsorId] = useState('');
  const [authError, setAuthError] = useState<{ code?: string; message: string } | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const registrationInProgressRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const updateAdminStatus = async () => {
      if (!currentUser) {
        setIsAdmin(false);
        return;
      }

      try {
        const role = await resolveCurrentUserRole();
        if (!cancelled) {
          setIsAdmin(role === 'admin' || role === 'super_admin');
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      }
    };

    updateAdminStatus();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    // Only restore local demo sessions; production sessions are owned by Firebase Auth.
    let activeUser: any = null;
    if (typeof window !== 'undefined') {
      const savedUserRaw = isDemoMode ? localStorage.getItem('gain_saved_user') : null;
      if (savedUserRaw) {
        try {
          const parsed = JSON.parse(savedUserRaw);
          if (parsed?.uid && parsed.uid !== 'gain-usr-demo') {
            activeUser = parsed;
          }
        } catch {}
      }
      if (!isDemoMode) {
        try {
          const savedUser = JSON.parse(localStorage.getItem('gain_saved_user') || 'null');
          if (typeof savedUser?.uid === 'string' && savedUser.uid.startsWith('gain-usr-')) {
            localStorage.removeItem('gain_saved_user');
          }
        } catch {
          localStorage.removeItem('gain_saved_user');
          }
      }
      if (isDemoMode && !activeUser) {
        localStorage.removeItem('gain_saved_user');
      }
      setCurrentUser(activeUser);
      if (activeUser) initUserProfile(activeUser).catch(() => {});
    }

    let connectionCheckActive = true;
    const checkBackendReadiness = async () => {
      try {
        const response = await fetch('/readyz', {
          method: 'GET',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!connectionCheckActive) return;

        setFirebaseConnectionStatus(
          response.ok ? 'connected' : 'error'
        );
      } catch {
        if (connectionCheckActive) {
          setFirebaseConnectionStatus('error');
        }
      }
    };

    const handleBrowserOffline = () => setFirebaseConnectionStatus('error');

    void checkBackendReadiness();
    window.addEventListener('online', checkBackendReadiness);
    window.addEventListener('offline', handleBrowserOffline);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Saat registrasi sedang berjalan, jangan jalankan
        // LOGIN gate dari listener ini.
        if (registrationInProgressRef.current) {
          setLoading(false);
          return;
        }

        try {
          /*
           * Refresh the Firebase identity before backend account-state
           * and Firestore operations so auth.uid and the ID token stay aligned.
           */
          await user.getIdToken(true);
          await user.reload();

          const freshUser = auth.currentUser;

          if (!freshUser || freshUser.uid !== user.uid) {
            throw Object.assign(
              new Error('Firebase authentication state changed before account check.'),
              { code: 'AUTH_STATE_CHANGED' },
            );
          }

          const accountState = await checkGainAccountProvisioned(freshUser);
          enforceActiveMemberState(accountState);

          if (!accountState.registered) {
            setCurrentUser(null);

            if (typeof window !== 'undefined') {
              localStorage.removeItem(`gain_wallet_${user.uid}`);
              localStorage.removeItem('gain_saved_user');
              }

            setAuthModalMode('register');
            setIsAuthModalOpen(true);
            setAuthError({
              code: 'ACCOUNT_NOT_REGISTERED',
              message: 'Akun Google Anda belum terdaftar sebagai Member GAIN. Silakan lakukan registrasi terlebih dahulu.',
            });

            setLoading(false);
            return;
          }

          const userObj = {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            emailVerified: user.emailVerified,
          } as any;

          setCurrentUser(userObj);
          // Firebase/member authentication is the dashboard identity gate.
          // Security elevation is independent and requested only by protected
          // actions after the dashboard is available.
          setIsAuthModalOpen(false);

          if (typeof window !== 'undefined') {
            localStorage.setItem('gain_saved_user', JSON.stringify(userObj));
          }
        } catch (err: any) {
          console.error('[ACCOUNT_STATE_CHECK_FAILED]', err);

          setCurrentUser(null);
          setAuthError({
            code: err?.code || 'ACCOUNT_STATE_CHECK_FAILED',
            message: err?.message || 'Status akun GAIN tidak dapat diperiksa.',
          });
        }
      }

      setLoading(false);
    });

      return () => {
        connectionCheckActive = false;
        window.removeEventListener('online', checkBackendReadiness);
        window.removeEventListener('offline', handleBrowserOffline);
        unsubscribe();
      };
  }, []);

  const loginWithGoogle = async (registrationData?: { sponsorId?: string; sponsorName?: string; desiredUsername?: string }) => {
    setIsLoggingIn(true);
    setAuthError(null);

    const isRegistration = Boolean(registrationData);
    registrationInProgressRef.current = isRegistration;

    try {
      const res = await signInWithGoogle();

      if (res.user) {
        // REGISTRASI:
        // hanya jalur ini yang boleh membuat Member GAIN.
        if (isRegistration) {
          await initUserProfile(res.user, registrationData);

          const userObj = {
            uid: res.user.uid,
            displayName: res.user.displayName,
            email: res.user.email,
            emailVerified: res.user.emailVerified,
          } as any;

          setCurrentUser(userObj);

          if (typeof window !== 'undefined') {
            localStorage.setItem('gain_saved_user', JSON.stringify(userObj));
          }

          setAuthError(null);
          setIsAuthModalOpen(false);

          reportClientEvent('auth.google.authenticated', {
            provider: 'google',
          });

          return;
        }

        // LOGIN:
        // Firebase authenticated TIDAK berarti sudah menjadi Member GAIN.
        const accountState = await checkGainAccountProvisioned(res.user);
        enforceActiveMemberState(accountState);

        if (!accountState.registered) {
          setCurrentUser(null);

          if (typeof window !== 'undefined') {
            localStorage.removeItem(`gain_wallet_${res.user.uid}`);
            localStorage.removeItem('gain_saved_user');
          }

          setAuthModalMode('register');
          setIsAuthModalOpen(true);

          setAuthError({
            code: 'ACCOUNT_NOT_REGISTERED',
            message: 'Akun Google Anda belum terdaftar sebagai Member GAIN. Silakan pilih "Daftar Akun Baru" terlebih dahulu.',
          });

          return;
        }

        const userObj = {
          uid: res.user.uid,
          displayName: res.user.displayName,
          email: res.user.email,
          emailVerified: res.user.emailVerified,
        } as any;

        setCurrentUser(userObj);
        // Google/member authentication is sufficient to enter the dashboard.
        // Security elevation is requested later only by protected actions.
        setIsAuthModalOpen(false);

        if (typeof window !== 'undefined') {
          localStorage.setItem('gain_saved_user', JSON.stringify(userObj));
        }

        reportClientEvent('auth.google.authenticated', {
          provider: 'google',
        });
      }
    } catch (err: any) {
      const code = typeof err?.code === 'string' ? err.code : 'auth/error';

      console.error('[AUTH_LOGIN_FAILED]', { code });

      reportClientEvent('auth.login.failed', {
        provider: 'google',
        errorCode: code,
      });

      setAuthError({
        code,
        message: err?.message || 'Login Google gagal',
      });
    } finally {
      registrationInProgressRef.current = false;
      setIsLoggingIn(false);
    }
  };

  const loginDirectly = async (email: string, registrationData?: { sponsorId?: string; sponsorName?: string; desiredUsername?: string }) => {
    if (!isDemoMode) {
      setAuthError({
        code: 'auth/demo-login-disabled',
        message: 'Login email hanya tersedia dalam mode demo. Gunakan Google Sign-In untuk akun Firebase dan sinkronisasi cloud.',
      });
      return;
    }

    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const dummyUser = {
        uid: `gain-usr-${email.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`,
        displayName: registrationData?.desiredUsername || email.split('@')[0],
      } as any;
      setCurrentUser(dummyUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem('gain_saved_user', JSON.stringify(dummyUser));
      }
      await initUserProfile(dummyUser, registrationData);
    } catch (err: any) {
      reportClientEvent('auth.login.failed', { provider: 'direct-demo', errorCode: 'auth/direct-login-error' });
      setAuthError({ code: 'auth/direct-login-error', message: err?.message || 'Login langsung gagal' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const retryUserProfileSync = async () => {
    if (!currentUser || auth.currentUser?.uid !== currentUser.uid) {
      throw new Error('Sesi Firebase belum siap. Silakan muat ulang halaman lalu coba lagi.');
    }

    setAuthError(null);

    try {
      const accountState = await checkGainAccountProvisioned(auth.currentUser);
      enforceActiveMemberState(accountState);

      if (!accountState.registered) {
        setCurrentUser(null);
        setAuthModalMode('register');
        setIsAuthModalOpen(true);

        throw Object.assign(
          new Error('Akun Google belum terdaftar sebagai Member GAIN.'),
          { code: 'ACCOUNT_NOT_REGISTERED' }
        );
      }
    } catch (err: any) {
      const message = err?.message || 'Status akun GAIN belum dapat diverifikasi.';

      setAuthError({
        code: err?.code || 'ACCOUNT_STATE_CHECK_FAILED',
        message,
      });

      throw err;
    }
  };

  const logout = async () => {
    try {
      // Logout is an authentication action only. It must never pause bots,
      // cancel open orders, or close positions. Trading controls are explicit
      // actions elsewhere in the UI. Manual logout only revokes the 24h
      // security session so the next protected action requires fresh verification.
      await clearElevatedSession();
      await signOutUser();
      reportClientEvent('auth.logout.success');
      if (typeof window !== 'undefined') {
        localStorage.removeItem('gain_saved_user');
        localStorage.removeItem('gain_active_api_creds');
        localStorage.removeItem('gain_active_api_creds_map');
        sessionStorage.removeItem('gain_active_api_creds');
      }
      setCurrentUser(null);
    } catch (err: any) {
      const code = typeof err?.code === 'string' ? err.code : 'auth/logout-error';
      console.error('[AUTH_LOGOUT_FAILED]', { code });
      reportClientEvent('auth.logout.failed', { errorCode: code });
      setAuthError({ code, message: err?.message || 'Logout gagal. Sesi tetap aktif.' });
    }
  };

  const openLogin = () => {
    setAuthModalMode('login');
    setIsAuthModalOpen(true);
  };

  const openRegister = (sponsorId?: string) => {
    if (sponsorId) setPendingSponsorId(sponsorId);
    setAuthModalMode('register');
    setIsAuthModalOpen(true);
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        loginWithGoogle,
        loginDirectly,
        retryUserProfileSync,
        logout,
        firebaseConnectionStatus,
        isLoggingIn,
        isAdmin,
        isAuthModalOpen,
        setIsAuthModalOpen,
        authModalMode,
        setAuthModalMode,
        pendingSponsorId,
        setPendingSponsorId,
        openLogin,
        openRegister,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
