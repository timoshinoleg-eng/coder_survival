import { h, Component } from 'preact';

/**
 * Top-level error boundary. Any synchronous render/lifecycle throw inside the
 * app would otherwise leave the Telegram WebView on a blank white screen with
 * no way to recover. This catches the error, shows a readable message and a
 * reload button, and keeps the failure visible instead of silent.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, info) {
    // Surface to console for diagnostics; do not include secrets/PII.
    console.error('[ErrorBoundary] Uncaught error:', error, info);
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      /* no-op */
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return h(
      'div',
      {
        style:
          'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
          'height:100%;padding:24px;gap:16px;text-align:center;color:#e6e6e6;' +
          'font-family:monospace;background:#0d0d12;'
      },
      h('div', { style: 'font-size:40px' }, '💥'),
      h('div', { style: 'font-size:18px;font-weight:bold' }, 'Что-то сломалось'),
      h(
        'div',
        { style: 'font-size:13px;opacity:.7;max-width:320px;word-break:break-word' },
        'Приложение столкнулось с ошибкой. Попробуй перезапустить.'
      ),
      h(
        'button',
        {
          onClick: this.handleReload,
          style:
            'margin-top:8px;padding:12px 24px;border:none;border-radius:10px;' +
            'background:#4a9eff;color:#fff;font-size:15px;font-weight:bold;cursor:pointer'
        },
        'Перезапустить'
      )
    );
  }
}
