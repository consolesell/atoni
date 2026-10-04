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
  updateDoc
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
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        setUserProfile(data);
      } else {
        // Create initial default profile (Standardized Virtual Account Anchor: $10 USD)
        const initialProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Trader',
          photoURL: firebaseUser.photoURL,
          accountMode: 'DEMO',
          demoBalance: 10,
          realBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(userRef, initialProfile);
        setUserProfile(initialProfile);
      }
    } catch (err) {
      console.error('Error fetching user profile from Firestore:', err);
      // Fallback local memory profile (Standardized Virtual Account Anchor: $10 USD)
      setUserProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || 'Trader',
        photoURL: firebaseUser.photoURL,
        accountMode: 'DEMO',
        demoBalance: 10,
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
        // Check if there is an active local Deriv OAuth profile saved
        try {
          const savedLocalProfile = localStorage.getItem('deriv_local_profile');
          if (savedLocalProfile) {
            setUserProfile(JSON.parse(savedLocalProfile));
          } else {
            setUserProfile(null);
          }
        } catch (e) {
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
    } catch (e) {}
  };

  const signInWithDerivOAuth = async (
    accounts: any[],
    primaryToken: string,
    primaryAccount: string,
    appId: string = '1089'
  ) => {
    const isVirtual = primaryAccount.startsWith('VRTC') || primaryAccount.includes('VR');
    const mode: 'DEMO' | 'REAL' = isVirtual ? 'DEMO' : 'REAL';

    if (user) {
      // User is logged into Firebase Auth -> sync with Firestore
      try {
        const userRef = doc(db, 'users', user.uid);
        const updates: any = {
          derivApiToken: primaryToken,
          derivAppId: appId,
          derivAccounts: accounts,
          derivActiveAccount: primaryAccount,
          accountMode: mode,
          updatedAt: new Date().toISOString(),
        };
        await updateDoc(userRef, updates);
        setUserProfile((prev) => prev ? { ...prev, ...updates } : null);
      } catch (err) {
        console.warn('Silent fallback on Firestore profile update:', err);
      }
    } else {
      // User is logging in directly via Deriv OAuth
      const localProfile: UserProfile = {
        uid: `deriv-${primaryAccount}`,
        email: `${primaryAccount.toLowerCase()}@deriv.user`,
        displayName: primaryAccount,
        photoURL: null,
        accountMode: mode,
        demoBalance: isVirtual ? 10000 : 10,
        realBalance: isVirtual ? 0 : 100,
        derivApiToken: primaryToken,
        derivAppId: appId,
        derivAccounts: accounts,
        derivActiveAccount: primaryAccount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setUserProfile(localProfile);
      try {
        localStorage.setItem('deriv_local_profile', JSON.stringify(localProfile));
      } catch (e) {}
    }
  };

  const updateAccountMode = async (mode: 'DEMO' | 'REAL') => {
    if (!user) {
      setUserProfile((prev) => prev ? { ...prev, accountMode: mode } : null);
      return;
    }
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { accountMode: mode, updatedAt: new Date().toISOString() });
      setUserProfile((prev) => prev ? { ...prev, accountMode: mode } : null);
    } catch (err) {
      console.error('Failed to update account mode in Firestore:', err);
      setUserProfile((prev) => prev ? { ...prev, accountMode: mode } : null);
    }
  };

  const updateBalances = async (demoBal?: number, realBal?: number) => {
    if (!userProfile) return;
    const updates: Partial<UserProfile> = { updatedAt: new Date().toISOString() };
    if (typeof demoBal === 'number') updates.demoBalance = demoBal;
    if (typeof realBal === 'number') updates.realBalance = realBal;

    setUserProfile((prev) => prev ? { ...prev, ...updates } : null);

    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, updates);
      } catch (err) {
        console.warn('Silent fallback on balance sync:', err);
      }
    }
  };

  const updateDerivCredentials = async (token: string, appId?: string) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const updates: any = { derivApiToken: token, updatedAt: new Date().toISOString() };
      if (appId) updates.derivAppId = appId;
      await updateDoc(userRef, updates);
      setUserProfile((prev) => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      console.error('Failed to update Deriv credentials:', err);
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
