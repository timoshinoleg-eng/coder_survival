import { h } from 'preact';
import { useGameState } from '../hooks/useGameState.js';
import { usePlayerRank, RANK_META, RANK_ORDER } from '../hooks/usePlayerRank.js';

export const BEATS = {
  1: { title: 'День 1', text: 'Ваш менеджер — NPC с календарём дедлайнов. Выживите первую неделю.', illustration: 'beat_01_manager' },
  3: { title: 'Первое код-ревью', text: 'Коллега оставил 47 комментариев. Вы чувствуете себя самозванцем.', illustration: 'beat_02_review' },
  5: { title: 'Legacy Codebase', text: 'Вы нашли TODO от 2014 года. Автор: unknown. Шанс выжить: 12%.', illustration: 'beat_03_cave' },
  7: { title: 'Тимлид', text: 'Теперь от вас зависит команда. Депрессия — это не баг, это фича.', illustration: 'beat_04_team' },
  10: { title: 'CTO', text: 'Все смотрят на вас. Даже когда вы просто пьёте кофе.', illustration: 'beat_05_cto' }
};

const RANK_DESCRIPTIONS = {
  Junior: 'Начало пути. Каждый тап даёт 1 коммит, базовый запас энергии.',
  Middle: 'Уверенный кодер. 2 коммита за тап, энергия +20%.',
  Senior: 'Мудрость приходит с опытом. 3 коммита за тап, энергия +50%.',
  Lead: 'Лидер команды. 5 коммитов за тап, энергия +80%.',
  CTO: 'Вершина карьеры. 8 коммитов за тап, максимальная энергия.',
};

function Illustration({ id }) {
  const accent = id === 'beat_03_cave' ? '#facc15' : id === 'beat_04_team' ? '#34d399' : '#60a5fa';
  return h('div', {
    style: {
      height: '116px',
      background: '#0b1628',
      border: '1px solid #315178',
      borderRadius: '8px',
      display: 'grid',
      placeItems: 'center'
    }
  }, h('div', {
    style: {
      width: '70px',
      height: '70px',
      background: accent,
      boxShadow: `-22px 22px 0 #1e293b, 22px 22px 0 ${accent}88`
    }
  }));
}

function BeatView({ beat, beatId, onDismiss }) {
  return h('div', {
    onClick: onDismiss,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 70,
      background: 'rgba(4, 8, 16, 0.78)',
      display: 'grid',
      placeItems: 'center',
      padding: '16px'
    }
  }, h('section', {
    onClick: (event) => event.stopPropagation(),
    style: {
      width: 'min(390px, 100%)',
      background: '#10192d',
      border: '1px solid #315178',
      borderRadius: '8px',
      padding: '16px',
      color: '#e5edf7',
      boxSizing: 'border-box'
    }
  }, [
    h(Illustration, { id: beat.illustration }),
    h('h2', { style: { fontSize: '20px', margin: '14px 0 8px' } }, beat.title),
    h('p', { style: { color: '#b8c7db', fontSize: '14px', lineHeight: 1.45, margin: '0 0 14px' } }, beat.text),
    h('button', {
      type: 'button',
      onClick: onDismiss,
      style: {
        width: '100%',
        minHeight: '42px',
        border: 0,
        borderRadius: '8px',
        background: '#2563eb',
        color: '#fff',
        fontWeight: 800,
        cursor: 'pointer',
      }
    }, 'Продолжить выживание')
  ]));
}

function CareerLadderView({ onClose }) {
  const { rank, level, xpTotal, xpProgress, xpRequiredForNext, progressPercent, nextRankName, currentRankIndex } = usePlayerRank();

  return h('div', {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 70,
      background: 'rgba(4, 8, 16, 0.78)',
      display: 'grid',
      placeItems: 'center',
      padding: '16px'
    }
  }, h('section', {
    onClick: (event) => event.stopPropagation(),
    style: {
      width: 'min(390px, 100%)',
      maxHeight: '80vh',
      overflowY: 'auto',
      background: '#10192d',
      border: '1px solid #315178',
      borderRadius: '8px',
      padding: '16px',
      color: '#e5edf7',
      boxSizing: 'border-box'
    }
  }, [
    h('h2', { style: { fontSize: '18px', margin: '0 0 12px', textAlign: 'center' } }, '🪜 Карьерная лестница'),

    // Current rank card
    h('div', {
      style: {
        background: '#0b1628',
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '14px',
      }
    }, [
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' } }, [
        h('span', { style: { fontSize: '28px' } }, RANK_META[rank]?.emoji),
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 800, fontSize: '14px' } }, `${rank} — Уровень ${level}`),
          h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginTop: '2px' } }, RANK_DESCRIPTIONS[rank] || ''),
        ]),
      ]),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' } }, [
        h('span', { className: 'pixel-badge', style: { fontSize: '8px', padding: '2px 6px' } }, `💪 ${RANK_META[rank]?.commitsPerTap || 1} коммит/тап`),
        h('span', { className: 'pixel-badge', style: { fontSize: '8px', padding: '2px 6px', borderColor: '#60a5fa' } }, `⚡ ${RANK_META[rank]?.maxEnergy || 100} энергии`),
      ]),
      xpRequiredForNext && h('div', null, [
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8ba1bb', marginBottom: '4px' } }, [
          h('span', null, `XP: ${xpTotal}`),
          h('span', null, `До ${nextRankName || 'макс'}: ${Math.max(0, xpRequiredForNext - xpProgress)}`),
        ]),
        h('div', {
          style: {
            height: '8px',
            background: '#0f3460',
            borderRadius: '0',
            overflow: 'hidden',
          }
        }, h('div', {
          style: {
            width: `${progressPercent}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
            transition: 'width 0.4s ease',
          }
        })),
      ]),
    ]),

    // Roadmap
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      RANK_ORDER.map((rankName, index) => {
        const meta = RANK_META[rankName];
        const isCurrent = rankName === rank;
        const isUnlocked = currentRankIndex >= index;
        return h('div', {
          key: rankName,
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '6px',
            background: isCurrent ? '#1a3a5c' : isUnlocked ? '#0b1628' : '#080f1a',
            border: `1px solid ${isCurrent ? '#3b82f6' : isUnlocked ? '#315178' : '#1e293b'}`,
            opacity: isUnlocked ? 1 : 0.45,
          }
        }, [
          h('span', { style: { fontSize: '22px' } }, meta.emoji),
          h('div', { style: { flex: 1 } }, [
            h('div', { style: { fontWeight: 700, fontSize: '12px', color: isCurrent ? '#60a5fa' : '#e5edf7' } }, rankName),
            h('div', { style: { fontSize: '10px', color: '#8ba1bb', marginTop: '2px' } }, RANK_DESCRIPTIONS[rankName]),
          ]),
          h('div', { style: { textAlign: 'right' } }, [
            h('div', { style: { fontSize: '10px', color: '#8ba1bb' } }, `XP ${meta.threshold}+`),
            h('div', { style: { fontSize: '10px', color: '#4ade80' } }, `+${meta.commitsPerTap} коммит/тап`),
          ]),
        ]);
      })
    ),

    h('button', {
      type: 'button',
      onClick: onClose,
      style: {
        width: '100%',
        minHeight: '42px',
        border: 0,
        borderRadius: '8px',
        background: '#2563eb',
        color: '#fff',
        fontWeight: 800,
        marginTop: '14px',
        cursor: 'pointer',
      }
    }, 'Закрыть'),
  ]));
}

export default function CareerModal({ open, onClose, suppressAutoBeat = false }) {
  const game = useGameState();
  const story = game.careerStory || {};
  const unlocked = (story.unlockedBeats || []).map(Number);
  const dismissed = new Set((story.dismissedBeats || []).map(Number));
  const beatId = unlocked.find((id) => BEATS[id] && !dismissed.has(id));
  const beat = BEATS[beatId];

  const handleDismissBeat = () => game.dismissCareerBeat?.(beatId);

  if (open) {
    return h(CareerLadderView, { onClose });
  }

  if (suppressAutoBeat || !beat) return null;

  return h(BeatView, { beat, beatId, onDismiss: handleDismissBeat });
}
