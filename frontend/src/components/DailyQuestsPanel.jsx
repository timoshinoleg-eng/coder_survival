import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { formatQuestTitle, formatRewardPayload } from '../utils/rewardFormatting.js';
import { audioManager } from '../utils/AudioManager.js';
import Confetti from './Confetti.jsx';

export default function DailyQuestsPanel({ open, onClose }) {
  const { daily, claimDailyQuest, streakDays, loginReward } = useGameState();
  const [claimingId, setClaimingId] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [bonusToast, setBonusToast] = useState(null);
  const [justCompletedQuestId, setJustCompletedQuestId] = useState(null);
  const prevQuestsRef = useRef([]);

  useEffect(() => {
    if (open) {
      audioManager.play('modalOpen');
      audioManager.duckForModal();
    } else {
      audioManager.resumeFromModal();
    }
  }, [open]);

  useEffect(() => {
    const quests = daily?.quests || [];
    const newlyCompleted = quests.find(
      (q) => q.completed && prevQuestsRef.current.find((p) => p.id === q.id && !p.completed)
    );
    if (newlyCompleted) {
      setJustCompletedQuestId(newlyCompleted.id);
      const t = setTimeout(() => setJustCompletedQuestId(null), 1200);
      return () => clearTimeout(t);
    }
    prevQuestsRef.current = quests;
  }, [daily?.quests]);

  if (!open) return null;

  const quests = daily?.quests || [];
  const allCompletedBonusLabel = formatRewardPayload(daily?.allCompletedBonusReward);

  async function handleClaim(questId) {
    setClaimingId(questId);
    setLocalError(null);
    setBonusToast(null);
    try {
      const result = await claimDailyQuest?.(questId);
      if (result?.reward || result?.bonusReward) {
        audioManager.play('questDone');
      }
      if (result?.bonusReward) {
        setBonusToast(`${formatRewardPayload(result.bonusReward)} (бонус за все квесты)`);
        setTimeout(() => setBonusToast(null), 3000);
      }
    } catch (err) {
      setLocalError(err?.message || 'Не удалось забрать награду');
    } finally {
      setClaimingId(null);
    }
  }

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'rgba(7, 12, 24, 0.78)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '16px 12px'
    }
  }, h('div', {
    onClick: (event) => event.stopPropagation(),
    style: {
      width: 'min(420px, 100%)',
      maxHeight: '70vh',
      overflowY: 'auto',
      background: '#10192d',
      border: '1px solid #274267',
      borderRadius: '8px',
      color: '#e6edf7',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)'
    }
  }, [
    justCompletedQuestId && h(Confetti),
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '1px solid #1f3552'
      }
    }, [
      h('strong', null, 'Ежедневные квесты'),
      h('button', {
        onClick: onClose,
        style: {
          border: 'none',
          background: 'transparent',
          color: '#9eb6d2',
          fontSize: '18px',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1
        }
      }, '×')
    ]),
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        fontSize: '12px',
        color: '#9eb6d2'
      }
    }, [
      h('span', null, `Выполнено: ${daily?.completed || 0}/${daily?.total || 0}`),
      h('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
        '🔥',
        h('span', { style: { color: '#facc15', fontWeight: 'bold' } }, `${streakDays || 0} дн.`)
      ])
    ]),

    // All-completed bonus banner
    daily?.allCompletedBonusAvailable && h('div', {
      style: {
        margin: '0 14px 10px',
        padding: '10px 12px',
        borderRadius: '8px',
        background: 'linear-gradient(90deg, #1a3a5c, #274267)',
        border: '1px solid #30527e',
        fontSize: '12px',
        color: '#c7ddf5',
        textAlign: 'center'
      }
    }, [
      h('div', { style: { fontWeight: 700, color: '#facc15', marginBottom: '2px' } }, '🎁 Бонус за все квесты'),
      h('div', null, `Забери все награды, чтобы получить ${allCompletedBonusLabel}`)
    ]),

    bonusToast && h('div', {
      style: {
        margin: '0 14px 10px',
        padding: '8px 10px',
        borderRadius: '6px',
        background: '#1a3f25',
        color: '#4ade80',
        fontSize: '12px',
        fontWeight: 600,
        border: '1px solid #2d5a3e'
      }
    }, bonusToast),

    localError && h('div', {
      style: {
        margin: '0 14px 10px',
        padding: '8px 10px',
        borderRadius: '6px',
        background: '#3f1a1a',
        color: '#fca5a5',
        fontSize: '12px'
      }
    }, localError),

    // Login reward section
    h('div', {
      style: {
        margin: '0 14px 12px',
        padding: '12px',
        borderRadius: '8px',
        background: 'linear-gradient(90deg, #1a3a5c, #274267)',
        border: '1px solid #30527e',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, [
      h('div', null, [
        h('div', { style: { fontWeight: 700, fontSize: '13px', color: '#facc15' } },
          loginReward?.claimed ? `🔥 День ${loginReward.streak} подряд!` : `🔥 ${streakDays || 0} дн. streak`
        ),
        h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginTop: '2px' } },
          loginReward?.claimed
            ? `Получено: ${formatRewardPayload(loginReward.reward)}`
            : 'Входи каждый день для бонуса'
        )
      ]),
      h('span', {
        style: {
          fontSize: '11px',
          color: loginReward?.claimed ? '#4ade80' : '#9eb6d2',
          fontWeight: 700
        }
      }, loginReward?.claimed ? 'Получено' : 'Ожидает')
    ]),

    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '0 14px 14px'
      }
    }, quests.length
      ? quests.map((quest) => {
        const progress = quest.targetValue > 0
          ? Math.min(100, Math.round((quest.progressValue / quest.targetValue) * 100))
          : 0;

        const title = formatQuestTitle(quest.questType, quest.targetValue);
        const reward = formatRewardPayload(quest.rewardPayload);

        return h('div', {
          key: quest.id,
          style: {
            background: '#131d33',
            borderRadius: '8px',
            padding: '12px',
            border: quest.completed && !quest.claimed ? '1px solid #4ade80' : '1px solid #1f3552'
          }
        }, [
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '8px'
            }
          }, [
            h('div', null, [
              h('div', { style: { fontWeight: 600, fontSize: '13px' } }, title),
              h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, reward)
            ]),
            quest.claimed
              ? h('span', { style: { color: '#4ade80', fontSize: '11px', fontWeight: 700 } }, 'Забрано')
              : quest.completed
                ? h('button', {
                  onClick: () => handleClaim(quest.id),
                  disabled: claimingId === quest.id,
                  style: {
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: claimingId === quest.id ? '#274267' : '#4ade80',
                    color: claimingId === quest.id ? '#8ba1bb' : '#0a1f12',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    cursor: claimingId === quest.id ? 'not-allowed' : 'pointer'
                  }
                }, claimingId === quest.id ? '...' : 'Забрать')
                : h('span', { style: { color: '#facc15', fontSize: '11px', fontWeight: 700 } }, 'В процессе')
          ]),
          h('div', {
            style: {
              height: '8px',
              background: '#0f3460',
              borderRadius: '4px',
              overflow: 'hidden'
            }
          }, h('div', {
            style: {
              width: `${progress}%`,
              height: '100%',
              background: quest.completed ? '#4ade80' : '#60a5fa',
              transition: 'width 0.25s ease'
            }
          })),
          h('div', {
            style: {
              marginTop: '6px',
              fontSize: '11px',
              color: '#8ba1bb',
              textAlign: 'right'
            }
          }, `${quest.progressValue}/${quest.targetValue}`)
        ]);
      })
      : h('div', { style: { color: '#9eb6d2', fontSize: '12px' } }, 'Квесты пока не сгенерированы'))
  ]));
}
