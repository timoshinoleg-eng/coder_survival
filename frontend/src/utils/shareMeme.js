export function shareMeme({ telegram, commits, rankName, shareableUrl = '' }) {
  const text = `Я накодил ${commits || 0} коммитов и дошёл до ${rankName || 'Junior'} в Coder Survival. А ты?`;

  if (shareableUrl && telegram?.shareUrl) {
    telegram.shareUrl(shareableUrl, text);
    return;
  }

  if (telegram?.shareText) {
    telegram.shareText(text);
    return;
  }

  const url = `https://t.me/share/url?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function shareReferralProgress({ telegram, commits, rankName, activeReferrals, milestone, referralLink }) {
  const text = `Я накодил ${commits || 0} коммитов, дошёл до ${rankName || 'Junior'} и уже привёл ${activeReferrals || 0} активных друзей. Давай вместе добьём milestone ${milestone || 3}!`;

  if (referralLink && telegram?.shareUrl) {
    telegram.shareUrl(referralLink, text);
    return;
  }

  if (telegram?.shareText) {
    telegram.shareText(text);
    return;
  }

  const url = referralLink
    ? `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`
    : `https://t.me/share/url?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
