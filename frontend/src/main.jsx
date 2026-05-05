import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { TelegramProvider } from './hooks/useTelegram.js';
import { GameProvider } from './hooks/useGameState.js';
import StatsBar from './components/StatsBar.jsx';
import TapArea from './components/TapArea.jsx';
import PhaserGame from './game/PhaserGame.js';

function App() {
  const [gameReady, setGameReady] = useState(false);

  useEffect(() => {
    // Init Telegram WebApp
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#1a1a2e');
      tg.setBackgroundColor('#1a1a2e');
      if (tg.enableClosingConfirmation) {
        tg.enableClosingConfirmation();
      }
    }
  }, []);

  return h(TelegramProvider, null,
    h(GameProvider, null,
      h('div', { id: 'app' },
        h(StatsBar),
        h('div', { id: 'game-container' },
          h(PhaserGame, { onReady: () => setGameReady(true) })
        ),
        h(TapArea, { active: gameReady })
      )
    )
  );
}

render(h(App), document.getElementById('app'));
