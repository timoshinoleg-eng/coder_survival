import { h } from 'preact';
import { useCallback } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { formatRewardPayload } from '../utils/rewardFormatting.js';
import { shareReferralProgress } from '../utils/shareMeme.js';

const MILESTONES = [3, 5, 10];

export default function ReferralChainPanel() {
  const { referralChain, user, commits, rankName } = useGameState();
  const telegram = useTelegram();

  const handleShare = useCallback(() => {
    shareReferralProgress({
      telegram,
      commits,
      rankName,
      activeReferrals: referralChain?.activeReferrals || 0,
      milestone: referralChain?.nextMilestone || 3,
      referralLink: `https://t.me/${telegram?.tg?.initDataUnsafe?.receiver?.username || 'codersurvival_bot'}?startapp=ref_${user?.telegramId || user?.id || 'me'}`
    });
  }, [telegram, commits, rankName, referralChain, user]);

  const activeReferrals = Number(referralChain?.activeReferrals || 0);
  const nextMilestone = Number(referralChain?.nextMilestone || 3);
  const milestoneReward = referralChain?.milestoneReward || { energy: 50 };

  return h('div', {
    style: {
      background: '#131d33',
      borderRadius: '8px',
      padding: '12px',
      border: '1px solid #1f3552'
    }
  }, [
    h('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#c7ddf5' } }, '🔗 Referral Chain'),
    h('div', { style: { fontSize: '13px', color: '#facc15', fontWeight: 700, marginBottom: '4px' } }, `${activeReferrals}/${nextMilestone} активных друзей`),
    h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '10px' } }, `Следующая награда: ${formatRewardPayload(milestoneReward)}`),
    h('div', {
      style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }
    }, MILESTONES.map((milestone) => {
      const reached = activeReferrals >= milestone;
      return h('div', {
        key: milestone,
        style: {
          padding: '6px 8px',
          borderRadius: '999px',
          border: `1px solid ${reached ? '#4ade80' : '#30527e'}`,
          background: reached ? '#1a3f25' : '#0f1b30',
          color: reached ? '#4ade80' : '#c7ddf5',
          fontSize: '11px',
          fontWeight: 600
        }
      }, `${milestone}+ друзей`);
    })),
    h('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }
    }, [
      h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, 'Еженедельный фокус: пригласи активного друга'),
      h('button', {
        onClick: handleShare,
        style: {
          border: 'none',
          background: '#274267',
          color: '#dce9f9',
          borderRadius: '6px',
          padding: '6px 10px',
          fontWeight: 600,
          fontSize: '11px',
          cursor: 'pointer'
        }
      }, 'Поделиться')
    ])
  ]);
}
