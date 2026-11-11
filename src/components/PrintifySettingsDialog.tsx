// Printify settings form: lives in the Settings window (Slice 21
// moved it out of the deleted Services menu). Collects the personal
// access token (session-only, masked, never displayed back) and the
// shop ID (persisted engine setting). The token lives in engine
// memory only: it is never written to settings storage or document
// JSON.
import { useState } from 'react';
import type { NibGliderEngine } from '../engine/engine';

export function PrintifySettingsForm({ engine }: { engine: NibGliderEngine }) {
  const [token, setToken] = useState('');
  const [shopId, setShopId] = useState(engine.printifyShopId);
  const [connected, setConnected] = useState(engine.hasPrintifyToken());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = (): void => {
    if (token.trim().length === 0) {
      setError('Enter a token first.');
      setNotice(null);
      return;
    }
    if (!engine.setPrintifyToken(token)) {
      setError('That token was rejected.');
      setNotice(null);
      return;
    }
    engine.setPrintifyShopId(shopId);
    setToken('');
    setConnected(true);
    setError(null);
    setNotice('Token saved for this session. Reloading clears it; the shop ID stays.');
  };

  const clear = (): void => {
    engine.clearPrintifyToken();
    setToken('');
    setConnected(false);
    setError(null);
    setNotice('Token cleared.');
  };

  return (
    <>
      <div className="settings-row">
        <span className="settings-label">Status</span>
        <span className="settings-value">{connected ? 'Token set for this session' : 'No token'}</span>
      </div>
      <div className="settings-row">
        <span className="settings-label" id="printify-token-label">Token</span>
        <input
          type="password"
          className="settings-text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={connected ? '•••••••• (saved)' : 'Paste personal access token'}
          value={token}
          aria-labelledby="printify-token-label"
          onChange={(event) => setToken(event.target.value)}
        />
      </div>
      <div className="settings-row">
        <span className="settings-label" id="printify-shop-label">Shop ID</span>
        <input
          type="text"
          className="settings-text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Shop ID"
          value={shopId}
          aria-labelledby="printify-shop-label"
          onChange={(event) => setShopId(event.target.value)}
        />
      </div>
      {error && <div className="settings-error" role="alert">{error}</div>}
      {notice && !error && <div className="settings-note">{notice}</div>}
      <div className="settings-note">The token stays in memory only and is never saved.</div>
      <div className="settings-actions">
        <button type="button" className="settings-toggle" onClick={clear} disabled={!connected && token.length === 0}>
          Clear
        </button>
        <button type="button" className="settings-apply" onClick={save} disabled={token.trim().length === 0}>
          Save
        </button>
      </div>
    </>
  );
}
