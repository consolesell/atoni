import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  auth,
  googleProvider,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  firebaseSignOut,
  onAuthStateChanged,
  db,
  doc,
  getDoc,
  setDoc,
  OperationType,
  handleFirestoreError,
} from '../lib/firebase';
import { UserProfile } from '../types/trading';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  googleAccessToken: string | null;
  connectGoogleDocs: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signInEmail: (email: string, pass: string) => Promise<void>;
  signUpEmail: (email: string, pass: string) => Promise<void>;
  signInWithDerivOAuth: (
    accounts: any[],
    primaryToken: string,
    primaryAccount: string,
    appId?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateAccountMode: (mode: 'DEMO' | 'REAL') => Promise<void>;
  updateBalances: (demoBal?: number, realBal?: number) => Promise<void>;
  updateDerivCredentials: (token: string, appId?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  const fetchOrCreateProfile = async (firebaseUser: User) => {
    const path = `users/${firebaseUser.uid}`;
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        setUserProfile(data);
      } else {
        const initialProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Trader',
          photoURL: firebaseUser.photoURL,
          accountMode: 'DEMO',
          demoBalance: 0,
          realBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(userRef, initialProfile);
        setUserProfile(initialProfile);
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.GET, path);
      } catch {
        // Maintain fallback profile in memory if Firestore rules block unconfigured collections
      }
      setUserProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || 'Trader',
        photoURL: firebaseUser.photoURL,
        accountMode: 'DEMO',
        demoBalance: 0,
        realBalance: 0,
      });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchOrCreateProfile(currentUser);
      } else {
        try {
          const savedLocalProfile = localStorage.getItem('deriv_local_profile');
          if (savedLocalProfile) {
            const parsed = JSON.parse(savedLocalProfile);
            if (parsed && typeof parsed === 'object') {
              delete parsed.derivApiToken;
              if (Array.isArray(parsed.derivAccounts)) {
                parsed.derivAccounts = parsed.derivAccounts.map(({ token: _omit, ...rest }: any) => rest);
              }
              setUserProfile(parsed);
            }
          } else {
            setUserProfile(null);
          }
        } catch {
          setUserProfile(null);
        }
        setGoogleAccessToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const connectGoogleDocs = async (): Promise<string | null> => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(res);
      const token = credential?.accessToken || null;
      if (token) {
        setGoogleAccessToken(token);
      }
      if (res.user) {
        await fetchOrCreateProfile(res.user);
      }
      return token;
    } catch (err) {
      console.error('Failed to connect Google Docs:', err);
      return null;
    }
  };

  const signInWithGoogle = async () => {
    const res = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(res);
    if (credential?.accessToken) {
      setGoogleAccessToken(credential.accessToken);
    }
    if (res.user) {
      await fetchOrCreateProfile(res.user);
    }
  };

  const signInEmail = async (email: string, pass: string) => {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    if (res.user) {
      await fetchOrCreateProfile(res.user);
    }
  };

  const signUpEmail = async (email: string, pass: string) => {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    if (res.user) {
      await fetchOrCreateProfile(res.user);
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('Firebase signout err:', e);
    }
    setUser(null);
    setUserProfile(null);
    setGoogleAccessToken(null);
    try {
      localStorage.removeItem('deriv_local_profile');
      localStorage.removeItem('deriv_api_token');
      localStorage.removeItem('deriv_active_loginid');
      localStorage.removeItem('deriv_linked_accounts');
    } catch {}
  };

  const signInWithDerivOAuth = async (
    accounts: any[],
    _primaryToken: string,
    primaryAccount: string,
    appId: string = '33zsnNh6YJ2HWm30oZZJR'
  ) => {
    const sanitizedAccounts = Array.isArray(accounts)
      ? accounts.map(({ token: _omit, ...rest }: any) => rest)
      : [];
    const activeAcctObj = sanitizedAccounts.find(
      (a: any) => a?.account === primaryAccount || a?.account_id === primaryAccount
    ) || sanitizedAccounts[0] || null;
    const isVirtual = Boolean(
      activeAcctObj?.isVirtual ??
      (activeAcctObj?.account_type === 'demo') ??
      (primaryAccount.startsWith('VRTC') || primaryAccount.includes('VR'))
    );
    const mode: 'DEMO' | 'REAL' = isVirtual ? 'DEMO' : 'REAL';
    const liveBalanceFromAcct =
      typeof activeAcctObj?.balance === 'number' && Number.isFinite(activeAcctObj.balance)
        ? activeAcctObj.balance
        : undefined;

    if (user) {
      const path = `users/${user.uid}`;
      const updates: any = {
        uid: user.uid,
        derivAppId: appId,
        derivAccounts: sanitizedAccounts,
        derivActiveAccount: primaryAccount,
        accountMode: mode,
        updatedAt: new Date().toISOString(),
      };
      if (typeof liveBalanceFromAcct === 'number') {
        if (isVirtual) updates.demoBalance = liveBalanceFromAcct;
        else updates.realBalance = liveBalanceFromAcct;
      }
      setUserProfile((prev) => (prev ? { ...prev, ...updates } : null));
      try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, updates, { merge: true });
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.WRITE, path);
        } catch {}
      }
    } else {
      const localProfile: UserProfile = {
        uid: `deriv-${primaryAccount}`,
        email: `${primaryAccount.toLowerCase()}@deriv.user`,
        displayName: primaryAccount,
        photoURL: null,
        accountMode: mode,
        demoBalance: isVirtual ? (liveBalanceFromAcct ?? 0) : 0,
        realBalance: !isVirtual ? (liveBalanceFromAcct ?? 0) : 0,
        derivAppId: appId,
        derivAccounts: sanitizedAccounts,
        derivActiveAccount: primaryAccount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setUserProfile(localProfile);
      try {
        localStorage.setItem('deriv_local_profile', JSON.stringify(localProfile));
      } catch {}
    }
  };

  const updateAccountMode = async (mode: 'DEMO' | 'REAL') => {
    const updatedAt = new Date().toISOString();
    setUserProfile((prev) => {
      if (!prev) return null;
      const next = { ...prev, accountMode: mode, updatedAt };
      if (!user) {
        try {
          localStorage.setItem('deriv_local_profile', JSON.stringify(next));
        } catch {}
      }
      return next;
    });
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { accountMode: mode, updatedAt }, { merge: true });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, path);
      } catch {}
    }
  };

  const updateBalances = async (demoBal?: number, realBal?: number) => {
    const updates: Partial<UserProfile> = { updatedAt: new Date().toISOString() };
    if (typeof demoBal === 'number' && Number.isFinite(demoBal)) updates.demoBalance = demoBal;
    if (typeof realBal === 'number' && Number.isFinite(realBal)) updates.realBalance = realBal;

    setUserProfile((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updates };
      if (!user) {
        try {
          localStorage.setItem('deriv_local_profile', JSON.stringify(next));
        } catch {}
      }
      return next;
    });

    if (user) {
      const path = `users/${user.uid}`;
      try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, updates, { merge: true });
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.UPDATE, path);
        } catch {}
      }
    }
  };

  const updateDerivCredentials = async (_token: string, appId?: string) => {
    const updates: any = { updatedAt: new Date().toISOString() };
    if (appId) updates.derivAppId = appId;

    setUserProfile((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updates };
      if (!user) {
        try {
          localStorage.setItem('deriv_local_profile', JSON.stringify(next));
        } catch {}
      }
      return next;
    });

    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, updates, { merge: true });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, path);
      } catch {}
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchOrCreateProfile(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        googleAccessToken,
        connectGoogleDocs,
        signInWithGoogle,
        signInEmail,
        signUpEmail,
        signInWithDerivOAuth,
        logout,
        updateAccountMode,
        updateBalances,
        updateDerivCredentials,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
