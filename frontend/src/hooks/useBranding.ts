/**
 * useBranding — fetches the practice display name and tagline from the API.
 *
 * This is called on the Login screen (before auth) so it uses a direct axios
 * call rather than the authenticated api client, and falls back gracefully if
 * the request fails.
 *
 * Result is cached for 5 minutes by TanStack Query.
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export interface Branding {
  practice_name: string;
  practice_tagline: string;
}

const DEFAULT_BRANDING: Branding = {
  practice_name: 'S.H.I.T.',
  practice_tagline: "Sam's Helpful Inventory Tracker",
};

export function useBranding(): Branding {
  const { data } = useQuery<Branding>({
    queryKey: ['branding'],
    queryFn: async () => {
      const apiUrl = (import.meta.env.VITE_API_URL as string) || '';
      const res = await axios.get<Branding>(`${apiUrl}/api/system/branding`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,   // re-fetch at most every 5 min
    retry: false,
    // Don't show loading state — fall back immediately
    placeholderData: DEFAULT_BRANDING,
  });

  return data ?? DEFAULT_BRANDING;
}
