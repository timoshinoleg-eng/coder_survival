import { h, createContext } from 'preact';
import { useContext, useCallback, useEffect, useState } from 'preact/hooks';
import { TonConnectUIProvider, useTonConnectUI, useTonWallet as useTonWalletLib } from '@tonconnect/ui-react';
import { Analytics } from '../utils/analytics.js';
import { apiRequest } from '../utils/api.js';

const MANIFEST_URL = import.meta.env.VITE_TON_MANIFEST_URL || `${typeof window !== 'undefined' ? window.location.origin : ''}/tonconnect-manifest.json`;

const TonWalletContext = createContext({
  wallet: null,
  walletAddress: null,
  connect: async () => {},
  disconnect: async () => {},
  sendTransaction: async () => {},
  loading: false,
  error: null,
});

function WalletInner({ children }) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWalletLib();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const walletAddress = wallet?.account?.address || null;

  useEffect(() => {
    if (walletAddress) {
      Analytics.track('wallet_connected', {
        method: 'ton_connect',
        currency: 'ton',
        wallet_address: walletAddress.slice(0, 8) + '...',
      });
      // Sync connected wallet to backend
      apiRequest('/api/wallet/connect', {
        method: 'POST',
        body: { walletAddress },
        initData: typeof window !== 'undefined' ? window.Telegram?.WebApp?.initData || '' : '',
      }).catch((err) => {
        console.warn('[TON Connect] Failed to sync wallet to backend:', err);
      });
    }
  }, [walletAddress]);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await tonConnectUI.openModal();
    } catch (err) {
      console.error('[TON Connect] connect error:', err);
      setError(err?.message || 'Failed to connect wallet');
      Analytics.track('wallet_connect_failed', { error: err?.message || 'unknown' });
    } finally {
      setLoading(false);
    }
  }, [tonConnectUI]);

  const disconnect = useCallback(async () => {
    try {
      await tonConnectUI.disconnect();
      Analytics.track('wallet_disconnected', { method: 'ton_connect' });
    } catch (err) {
      console.error('[TON Connect] disconnect error:', err);
    }
  }, [tonConnectUI]);

  const sendTransaction = useCallback(async (amount, toAddress, comment = '') => {
    const nanoAmount = Math.round(parseFloat(amount) * 1e9).toString();
    const payload = {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: toAddress,
          amount: nanoAmount,
          ...(comment ? { payload: comment } : {}),
        },
      ],
    };
    try {
      const result = await tonConnectUI.sendTransaction(payload);
      Analytics.track('wallet_transaction_sent', {
        currency: 'ton',
        amount: parseFloat(amount),
        to: toAddress,
      });
      return result;
    } catch (err) {
      Analytics.track('wallet_transaction_failed', {
        currency: 'ton',
        amount: parseFloat(amount),
        error: err?.message || 'unknown',
      });
      throw err;
    }
  }, [tonConnectUI]);

  const value = {
    wallet,
    walletAddress,
    connect,
    disconnect,
    sendTransaction,
    loading,
    error,
  };

  return h(TonWalletContext.Provider, { value }, children);
}

export function TonWalletProvider({ children }) {
  return h(
    TonConnectUIProvider,
    {
      manifestUrl: MANIFEST_URL,
      uiPreferences: { theme: 'DARK' },
    },
    h(WalletInner, null, children)
  );
}

export function useTonWallet() {
  return useContext(TonWalletContext);
}
