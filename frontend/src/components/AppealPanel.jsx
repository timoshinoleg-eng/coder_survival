import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { apiRequest } from '../utils/api.js';
import { useTelegram } from '../hooks/useTelegram.js';

export default function AppealPanel({ open, onClose }) {
  const { antiCheat } = useGameState();
  const { initData } = useTelegram();
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState([]);
  const [hasOpen, setHasOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  if (!open) return null;

  const lastViolationLabel = antiCheat?.lastViolationAt
    ? new Date(antiCheat.lastViolationAt).toLocaleString()
    : 'нет данных';

  useEffect(() => {
    if (!open) return;
    apiRequest('/api/appeal', { initData }).then((payload) => {
      setRequests(payload?.requests || []);
      setHasOpen(payload?.hasOpen === true);
    }).catch(() => null);
  }, [open, initData]);

  async function submitAppeal() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = await apiRequest('/api/appeal', {
        method: 'POST',
        initData,
        body: { message },
      });
      setRequests((current) => [payload.appeal, ...current]);
      setHasOpen(true);
      setMessage('');
    } catch (err) {
      setError(err?.message || 'Не удалось отправить апелляцию');
    } finally {
      setSubmitting(false);
    }
  }

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 45,
      background: 'rgba(7, 12, 24, 0.82)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px 12px',
    },
  }, h('div', {
    onClick: (event) => event.stopPropagation(),
    className: 'pixel-panel',
    style: {
      width: 'min(420px, 100%)',
      background: '#10192d',
      color: '#e6edf7',
      border: '1px solid #274267',
      borderRadius: '8px',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    },
  }, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      h('strong', null, 'Апелляция античита'),
      h('button', { onClick: onClose, style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '18px', cursor: 'pointer' } }, 'x'),
    ]),
    h('div', { style: { fontSize: '12px', color: '#c7ddf5' } }, `Ban score: ${antiCheat?.banScore || 0}`),
    h('div', { style: { fontSize: '12px', color: '#fde68a' } }, `Текущий tier: ${antiCheat?.sanctionTier || 'none'}`),
    antiCheat?.sanctionAction && h('div', { style: { fontSize: '12px', color: '#fca5a5' } }, `Санкция: ${antiCheat.sanctionAction}`),
    antiCheat?.sanctionEffects?.length > 0 && h('div', { style: { fontSize: '11px', color: '#c7ddf5' } }, `Эффекты: ${antiCheat.sanctionEffects.join(', ')}`),
    h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, `Последнее нарушение: ${lastViolationLabel}`),
    h('div', { style: { fontSize: '12px', color: '#9eb6d2' } }, antiCheat?.appealAvailable
      ? 'Апелляция доступна. Отправь запрос через поддержку и укажи дату, устройство и примерное время проблемы.'
      : 'Апелляция откроется автоматически при ban score >= 50.'),
    h('div', { style: { fontSize: '11px', color: '#8ba1bb' } }, `Путь: ${antiCheat?.appealLocation || 'Settings -> Account -> Appeal Ban'}`),
    antiCheat?.appealAvailable && h('textarea', {
      value: message,
      onInput: (event) => setMessage(event.target.value),
      placeholder: 'Опиши, почему считаешь бан/ограничение ошибкой...',
      style: {
        minHeight: '88px',
        background: '#0f1b30',
        color: '#e6edf7',
        border: '1px solid #315178',
        borderRadius: '8px',
        padding: '10px',
        opacity: hasOpen ? 0.6 : 1,
      }
    }),
    hasOpen && h('div', { style: { fontSize: '11px', color: '#fde68a' } }, 'У тебя уже есть открытая апелляция. Дождись ответа поддержки перед новой отправкой.'),
    antiCheat?.appealAvailable && h('button', {
      onClick: submitAppeal,
      disabled: submitting || hasOpen || message.trim().length < 10,
      style: {
        minHeight: '40px',
        border: '1px solid #315178',
        borderRadius: '8px',
        background: '#13263d',
        color: '#dbeafe',
        fontWeight: 700,
        cursor: 'pointer',
        opacity: submitting || hasOpen || message.trim().length < 10 ? 0.6 : 1,
      }
    }, submitting ? 'Отправка...' : hasOpen ? 'Апелляция уже открыта' : 'Отправить апелляцию'),
    error && h('div', { style: { fontSize: '11px', color: '#fca5a5' } }, error),
    requests.length > 0 && h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        borderTop: '1px solid #1f3552',
        paddingTop: '8px',
      }
    }, requests.map((request) => h('div', {
      key: request.id,
      style: {
        fontSize: '11px',
        color: '#c7ddf5',
        background: '#0f1b30',
        border: '1px solid #1f3552',
        borderRadius: '8px',
        padding: '8px',
      }
    }, [
      h('div', { style: { color: request.status === 'open' ? '#facc15' : '#4ade80', fontWeight: 700 } }, `#${request.id} · ${request.status}`),
      h('div', { style: { marginTop: '2px' } }, `Ban score snapshot: ${request.ban_score_snapshot ?? '—'}`),
      h('div', { style: { marginTop: '2px', color: '#8ba1bb' } }, `${request.sanction_tier || 'none'} · ${new Date(request.created_at).toLocaleString()}`),
    ]))),
  ]));
}
