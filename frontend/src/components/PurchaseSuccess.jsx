import { h } from 'preact';
import { useEffect } from 'preact/hooks';

const SLIDE_STYLE = {
  position: 'absolute',
  bottom: '12px',
  left: '12px',
  right: '12px',
  zIndex: 50,
  animation: 'purchase-success-slide 0.3s ease-out'
};

const KEYFRAMES = `
@keyframes purchase-success-slide {
  0% { transform: translateY(100%); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes purchase-success-exit {
  0% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(100%); opacity: 0; }
}
`;

export default function PurchaseSuccess({ product, effect, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => onClose(), 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  if (!product || !effect) return null;

  return h('div', {
    style: SLIDE_STYLE
  }, [
    h('style', null, KEYFRAMES),

    h('div', {
      style: {
        background: 'linear-gradient(90deg, #1a3a2c, #1f4a35)',
        border: '1px solid #4ade80',
        borderRadius: '10px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 4px 16px rgba(74, 222, 128, 0.2)',
        color: '#e6edf7'
      }
    }, [
      h('span', {
        style: { fontSize: '22px' }
      }, effect.icon),

      h('div', {
        style: { flex: 1, minWidth: 0 }
      }, [
        h('div', {
          style: {
            fontWeight: 700,
            fontSize: '13px',
            color: '#4ade80',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }
        }, product.name),
        h('div', {
          style: {
            fontSize: '11px',
            color: '#c7ddf5'
          }
        }, effect.text)
      ]),

      h('button', {
        onPointerDown: onClose,
        style: {
          background: 'transparent',
          border: 'none',
          color: '#6b7f99',
          fontSize: '16px',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1
        }
      }, '\u00d7')
    ])
  ]);
}
