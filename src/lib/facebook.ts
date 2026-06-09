// Facebook JavaScript SDK loader and type declarations.
// FB.login() manages the OAuth popup internally — no redirect URI needed.

interface FBAuthResponse {
  accessToken: string;
  userID: string;
  expiresIn: number;
  signedRequest: string;
  grantedScopes?: string;
}

interface FBLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse: FBAuthResponse | null;
}

interface FBSDK {
  init(params: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
  login(
    callback: (response: FBLoginResponse) => void,
    options?: { scope?: string; return_scopes?: boolean; auth_type?: string },
  ): void;
  getLoginStatus(callback: (response: FBLoginResponse) => void, force?: boolean): void;
  api(path: string, callback: (response: unknown) => void): void;
  api(path: string, params: Record<string, unknown>, callback: (response: unknown) => void): void;
}

declare global {
  interface Window {
    FB: FBSDK;
    fbAsyncInit?: () => void;
  }
}

let _appId: string | null = null;
let _loaded = false;
let _loading = false;
const _waiters: Array<() => void> = [];

export function loadFacebookSDK(appId: string): Promise<void> {
  return new Promise((resolve) => {
    if (_loaded && _appId === appId) { resolve(); return; }
    _waiters.push(resolve);
    if (_loading) return;
    _loading = true;
    _appId = appId;

    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version: 'v20.0' });
      _loaded = true;
      _waiters.forEach(cb => cb());
      _waiters.length = 0;
    };

    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}
