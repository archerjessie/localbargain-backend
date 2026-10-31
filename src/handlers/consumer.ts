// Consumer Lambda: the signed-in consumer's profile, QR codes, history, and account deletion (design D2).
import { json } from '../domain/responses.js';
import { getCaller } from '../identity/caller.js';
import { router } from './router.js';

export const handler = router({
  // The profile lives in Cognito, so the ID token claims are the whole answer (design D4).
  'GET /me': async (event) => {
    const caller = getCaller(event, 'consumer');
    if (!caller.ok) return caller.response;
    const { sub, email, displayName } = caller.caller;
    return json(200, { userId: sub, email, displayName: displayName ?? null });
  },
});
