import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// ── Web Audio notification beep (no file required) ───────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // A pleasant two-tone chime: 880 Hz → 1108 Hz
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1108, t + 0.12);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gain.gain.setValueAtTime(0.25, t + 0.1);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

    osc.start(t);
    osc.stop(t + 0.55);

    // Clean up after playback
    osc.onended = () => ctx.close();
  } catch {
    // Audio not supported — fail silently
  }
}

// ── Notification hook ─────────────────────────────────────────────────────────
// Polls for new requests every 30 s.
// - Nurses hear a beep + toast when a doctor raises a new pending request.
// - Doctors/admins hear a beep + toast when a nurse submits a new quick-charge
//   receipt (status='fulfilled', is_quick_charge=true).
export function useNotifications() {
  const { user } = useAuth();
  const { notificationSound } = useTheme();
  const lastSeenRef = useRef<string>(new Date().toISOString());
  const initializedRef = useRef(false);

  // Build the correct query based on role
  const statusFilter = user?.role === 'nurse' ? 'pending' : 'fulfilled';

  const { data } = useQuery({
    queryKey: ['notifications-poll', user?.id, statusFilter],
    queryFn: async () => {
      const res = await api.get('/requests', {
        params: { status: statusFilter, since: lastSeenRef.current, limit: 10 },
      });
      return res.data;
    },
    // Only poll when logged in
    enabled: !!user,
    // Poll every 30 seconds
    refetchInterval: 30_000,
    // Don't fire on window focus to avoid false positives
    refetchOnWindowFocus: false,
    // No stale-while-revalidate caching for this poll
    staleTime: 0,
    gcTime: 0,
  });

  const handleNewRequests = useCallback((requests: Array<{ request_number: string; doctor_name?: string; is_quick_charge?: boolean }>) => {
    if (requests.length === 0) return;

    if (notificationSound) playBeep();

    if (user?.role === 'nurse') {
      // New requests from doctors waiting to be fulfilled
      const names = requests.map(r => r.request_number).slice(0, 3).join(', ');
      const extra = requests.length > 3 ? ` + ${requests.length - 3} more` : '';
      toast(`📋 New request: ${names}${extra}`, {
        duration: 6000,
        style: { background: '#1e40af', color: '#fff', fontWeight: 500 },
        icon: '🔔',
      });
    } else {
      // Doctors/admins: new quick-charges sent back by nurses
      const count = requests.length;
      toast(`🧾 ${count} new quick-charge receipt${count > 1 ? 's' : ''} from nurses`, {
        duration: 6000,
        style: { background: '#065f46', color: '#fff', fontWeight: 500 },
        icon: '✅',
      });
    }

    // Advance the cursor so we don't re-alert on the same items
    lastSeenRef.current = new Date().toISOString();
  }, [user?.role]);

  useEffect(() => {
    // Skip the very first data load — it's "current state", not new notifications
    if (!initializedRef.current) {
      initializedRef.current = true;
      // Advance cursor past any existing records so first poll shows nothing
      lastSeenRef.current = new Date().toISOString();
      return;
    }

    const requests = data?.requests ?? [];
    if (requests.length > 0) {
      handleNewRequests(requests);
    }
  }, [data, handleNewRequests]);
}
