import { useQuery } from '@tanstack/react-query';
import { fetchData } from '@/lib/fetch-util';
import type { UserProductivityStats, ApiError } from '../types';

export const useUserAnalytics = (userId: string) => {
  return useQuery<UserProductivityStats, ApiError>({
    queryKey: ['analytics', 'user', userId],
    queryFn: async () => {
      const response = await fetchData<UserProductivityStats>(`/analytics/user/${userId}`);
      return response;
    },
    enabled: !!userId, // Only fetch if userId is provided
    staleTime: 0, // Real-time data - no caching
    gcTime: 0, // Don't cache results
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};
