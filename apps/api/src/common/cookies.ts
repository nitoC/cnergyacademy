export const ACCESS_COOKIE = 'academy_at';
export const REFRESH_COOKIE = 'academy_rt';
/** Non-secret hint ('1') readable by the web app's route proxy so it can redirect
 *  signed-out visitors before rendering. It grants nothing; the API still
 *  authenticates every request with the httpOnly tokens. */
export const SESSION_HINT_COOKIE = 'academy_session';
/** Requests that change state must carry this header. Browsers cannot add
 *  custom headers to cross-site requests without a CORS preflight, which
 *  the API rejects for foreign origins — this is the CSRF defence for the
 *  cookie-based session. */
export const CSRF_HEADER = 'x-academy-csrf';
