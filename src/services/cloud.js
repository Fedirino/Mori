const FIREBASE_SDK_VERSION = '12.16.0';

export class CloudRequestError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'CloudRequestError';
    this.status = status;
  }
}

export function createWinstonCloud({ onState = () => {} } = {}) {
  let auth = null;
  let authApi = null;
  let user = null;
  let ready = false;
  let initialized = false;

  function publish(extra = {}) {
    onState({
      ready,
      initialized,
      user: user ? { email: user.email || '', displayName: user.displayName || '' } : null,
      ...extra
    });
  }

  async function probe() {
    try {
      const response = await fetch('/api/health', { cache: 'no-store', headers: { Accept: 'application/json' } });
      const type = response.headers.get('content-type') || '';
      if (!response.ok || !type.includes('application/json')) return false;
      const data = await response.json();
      return data.ready === true;
    } catch (error) {
      return false;
    }
  }

  async function init() {
    if (initialized) return { ready, user };
    ready = await probe();
    if (!ready) {
      initialized = true;
      publish();
      return { ready, user };
    }
    try {
      const configResponse = await fetch('/__/firebase/init.json', { cache: 'no-store' });
      if (!configResponse.ok) throw new Error('Firebase configuration is unavailable.');
      const config = await configResponse.json();
      const base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION;
      const [appApi, loadedAuthApi] = await Promise.all([
        import(base + '/firebase-app.js'),
        import(base + '/firebase-auth.js')
      ]);
      authApi = loadedAuthApi;
      const app = appApi.getApps().length ? appApi.getApp() : appApi.initializeApp(config);
      auth = authApi.getAuth(app);
      await authApi.getRedirectResult(auth).catch(() => null);
      await new Promise((resolve) => {
        let first = true;
        authApi.onAuthStateChanged(auth, (nextUser) => {
          user = nextUser;
          initialized = true;
          publish();
          if (first) {
            first = false;
            resolve();
          }
        });
      });
    } catch (error) {
      ready = false;
      initialized = true;
      publish({ error: error.message });
    }
    return { ready, user };
  }

  async function signIn() {
    if (!ready || !auth || !authApi) throw new CloudRequestError('The cloud backend is not ready.');
    const provider = new authApi.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await authApi.signInWithPopup(auth, provider);
    } catch (error) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(error.code)) {
        await authApi.signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  }

  async function signOut() {
    if (auth && authApi) await authApi.signOut(auth);
  }

  async function request(path, { json = null, responseType = 'json' } = {}) {
    if (!ready) throw new CloudRequestError('The cloud backend is not configured.', 503);
    if (!auth || !auth.currentUser) throw new CloudRequestError('Sign in with Google first.', 401);
    const token = await auth.currentUser.getIdToken();
    const response = await fetch('/api/' + path, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: responseType === 'blob' ? 'audio/mpeg' : 'application/json'
      },
      body: JSON.stringify(json || {})
    });
    if (!response.ok) {
      const type = response.headers.get('content-type') || '';
      const data = type.includes('application/json') ? await response.json().catch(() => ({})) : {};
      throw new CloudRequestError(data.error || 'Cloud request failed.', response.status);
    }
    return responseType === 'blob' ? response.blob() : response.json();
  }

  return {
    init,
    signIn,
    signOut,
    chat: (payload) => request('chat', { json: payload }),
    speak: (payload) => request('tts', { json: payload, responseType: 'blob' }),
    transcribe: (payload) => request('transcribe', { json: payload })
  };
}
