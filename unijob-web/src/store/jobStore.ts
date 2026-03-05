import { create } from 'zustand';
import type { Job, JobFilter } from '@/types';
import { getJobs } from '@/services/job.service';

interface JobState {
  jobs: Job[];
  isLoading: boolean;
  filters: JobFilter;
  hasMore: boolean;

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

  fetchJobs: async (reset = false) => {
    const { filters } = get();
    set({ isLoading: true });

    try {
      const jobs = await getJobs(filters);
      set({
        jobs: reset ? jobs : [...get().jobs, ...jobs],
        isLoading: false,
        hasMore: jobs.length > 0,
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
    }));
    get().fetchJobs(true);
  },

  resetFilters: () => {
    set({ filters: { ...defaultFilters }, jobs: [], hasMore: true });
    get().fetchJobs(true);
  },
}));
