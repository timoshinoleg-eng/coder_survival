import { h } from 'preact';
import { useGameState } from '../hooks/useGameState.js';

const BEATS = {
  1: { title: 'День 1', text: 'Ваш менеджер — NPC с календарём дедлайнов. Выживите первую неделю.', illustration: 'beat_01_manager' },
  3: { title: 'Первое код-ревью', text: 'Коллега оставил 47 комментариев. Вы чувствуете себя самозванцем.', illustration: 'beat_02_review' },
  5: { title: 'Legacy Codebase', text: 'Вы нашли TODO от 2014 года. Автор: unknown. Шанс выжить: 12%.', illustration: 'beat_03_cave' },
  7: { title: 'Тимлид', text: 'Теперь от вас зависит команда. Депрессия — это не баг, это фича.', illustration: 'beat_04_team' },
  10: { title: 'CTO', text: 'Все смотрят на вас. Даже когда вы просто пьёте кофе.', illustration: 'beat_05_cto' }
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

export default function CareerModal() {
  const game = useGameState();
  const story = game.careerStory || {};
  const unlocked = (story.unlockedBeats || []).map(Number);
  const dismissed = new Set((story.dismissedBeats || []).map(Number));
  const beatId = unlocked.find((id) => !dismissed.has(id));
  const beat = BEATS[beatId];
  if (!beat) return null;

  return h('div', {
    onClick: () => game.dismissCareerBeat?.(beatId),
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
      onClick: () => game.dismissCareerBeat?.(beatId),
      style: {
        width: '100%',
        minHeight: '42px',
        border: 0,
        borderRadius: '8px',
        background: '#2563eb',
        color: '#fff',
        fontWeight: 800
      }
    }, 'Продолжить выживание')
  ]));
}
