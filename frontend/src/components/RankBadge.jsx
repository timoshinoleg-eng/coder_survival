import { h } from 'preact';
import { usePlayerRank } from '../hooks/usePlayerRank.js';

export default function RankBadge({ onClick }) {
  const { rank, progressPercent, rankMeta, nextRankName } = usePlayerRank();

  return h(
    'div',
    {
      onClick: onClick,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        cursor: onClick ? 'pointer' : 'default',
      },
      title: `${rank} — ${rankMeta.commitsPerTap} коммит/тап, макс. энергия ${rankMeta.maxEnergy}`,
    },
    [
      h(
        'span',
        {
          className: 'pixel-badge',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '9px',
            padding: '3px 6px',
          },
        },
        [h('span', null, rankMeta.emoji), rank.toUpperCase()]
      ),
      nextRankName &&
        h(
          'div',
          {
            className: 'pixel-progress',
            style: {
              width: '36px',
              height: '4px',
              borderWidth: '1px',
            },
          },
          h('div', {
            className: 'pixel-progress__bar',
            style: {
              width: `${progressPercent}%`,
              background: '#4ade80',
              transition: 'width 0.4s ease',
            },
          })
        ),
    ]
  );
}
