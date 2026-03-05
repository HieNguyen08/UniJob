import { create } from 'zustand';
import type { User as FirebaseUser } from 'firebase/auth';
import type { User } from '@/types';
import { onAuthChanged, getCurrentUserProfile, signInWithGoogle, signOut } from '@/services/auth.service';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  userProfile: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  initialize: () => () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  userProfile: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: () => {
    const unsubscribe = onAuthChanged(async (user) => {
      if (user) {
        const profile = await getCurrentUserProfile(user.uid);
        set({
          firebaseUser: user,
          userProfile: profile,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({
          firebaseUser: null,
          userProfile: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    });
    return unsubscribe;
  },

  login: async () => {
    try {
      set({ isLoading: true });
      const user = await signInWithGoogle();
      const profile = await getCurrentUserProfile(user.uid);
      set({
        firebaseUser: user,
        userProfile: profile,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await signOut();
    set({
      firebaseUser: null,
      userProfile: null,
      isAuthenticated: false,
    });
  },

  refreshProfile: async () => {
    const { firebaseUser } = get();
    if (firebaseUser) {
      const profile = await getCurrentUserProfile(firebaseUser.uid);
      set({ userProfile: profile });
    }
  },
}));
