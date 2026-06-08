import { h } from 'preact';
import { useTonWallet } from '../hooks/useTonWallet.js';

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WalletConnect() {
  const { wallet, walletAddress, connect, disconnect, loading } = useTonWallet();

  if (!walletAddress) {
    return h('button', {
      onClick: connect,
      disabled: loading,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px solid #30527e',
        background: '#1a3a5c',
        color: '#dce9f9',
        fontSize: '12px',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
      }
    }, [
      h('span', { style: { fontSize: '14px' } }, '💎'),
      loading ? 'Подключение...' : 'Connect TON Wallet'
    ]);
  }

  return h('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderRadius: '8px',
      border: '1px solid #30527e',
      background: '#131d33',
      color: '#dce9f9',
      fontSize: '12px',
    }
  }, [
    h('span', { style: { fontSize: '14px' } }, '💎'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, [
      h('span', { style: { fontWeight: 600 } }, truncateAddress(walletAddress)),
      h('span', { style: { fontSize: '10px', color: '#8ba1bb' } }, 'Balance: — TON'),
    ]),
    h('button', {
      onClick: disconnect,
      style: {
        marginLeft: 'auto',
        padding: '4px 8px',
        borderRadius: '6px',
        border: 'none',
        background: '#274267',
        color: '#9eb6d2',
        fontSize: '11px',
        cursor: 'pointer',
      }
    }, 'Disconnect')
  ]);
}
