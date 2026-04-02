import { create } from 'zustand';
import type { Job, JobFilter } from '@/types';
import { getJobs } from '@/services/job.service';
import type { DocumentData } from 'firebase/firestore';

interface JobState {
  jobs: Job[];
  isLoading: boolean;
  filters: JobFilter;
  hasMore: boolean;
  lastDoc: DocumentData | undefined;

  // Actions
  fetchJobs: (reset?: boolean) => Promise<void>;
  setFilters: (filters: Partial<JobFilter>) => void;
  resetFilters: () => void;
}

const defaultFilters: JobFilter = {
  category: undefined,
  faculty: undefined,
  isUrgent: undefined,
  paymentType: undefined,
  status: 'open',
  searchQuery: '',
  sortBy: 'newest',
};

export const useJobStore = create<JobState>((set, get) => ({
  jobs: [],
  isLoading: false,
  filters: { ...defaultFilters },
  hasMore: true,
  lastDoc: undefined,

  fetchJobs: async (reset = false) => {
    const { filters, lastDoc } = get();
    set({ isLoading: true });

    try {
      const cursor = reset ? undefined : lastDoc;
      let jobs = await getJobs(filters, undefined, cursor);

      // Client-side search filtering (Firestore doesn't support full-text search)
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        jobs = jobs.filter(
          (job) =>
            job.title.toLowerCase().includes(query) ||
            job.description.toLowerCase().includes(query)
        );
      }

      // Track the last document for pagination cursor
      const newLastDoc = jobs.length > 0 ? jobs[jobs.length - 1] : undefined;

      set({
        jobs: reset ? jobs : [...get().jobs, ...jobs],
        isLoading: false,
        hasMore: jobs.length > 0,
        lastDoc: newLastDoc,
      });
    } catch (error) {
      console.error('Error fetching jobs:', error);
      set({ isLoading: false });
    }
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      jobs: [],
      hasMore: true,
      lastDoc: undefined,
    }));
    get().fetchJobs(true);
  },

  resetFilters: () => {
    set({ filters: { ...defaultFilters }, jobs: [], hasMore: true, lastDoc: undefined });
    get().fetchJobs(true);
  },
}));
