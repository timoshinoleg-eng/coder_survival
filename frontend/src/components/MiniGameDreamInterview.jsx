import { h } from 'preact';
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { useGameState } from '../hooks/useGameState.js';
import { useTelegram } from '../hooks/useTelegram.js';
import { audioManager } from '../utils/AudioManager.js';
import { apiRequest } from '../utils/api.js';

const QUESTIONS = [
  { q: 'Что вернёт `typeof null` в JavaScript?', options: ['"null"', '"object"', '"undefined"', '"number"'], correct: 1 },
  { q: 'Какая команда создаёт новую ветку в git?', options: ['git branch', 'git checkout', 'git new', 'git switch -c'], correct: 3 },
  { q: 'Сложность бинарного поиска?', options: ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'], correct: 1 },
  { q: 'Какой HTTP статус означает "Not Found"?', options: ['400', '401', '403', '404'], correct: 3 },
  { q: 'Что делает SQL команда DROP?', options: ['Удаляет таблицу', 'Удаляет строку', 'Создаёт индекс', 'Обновляет данные'], correct: 0 },
  { q: 'Какой порт по умолчанию у PostgreSQL?', options: ['3306', '5432', '6379', '27017'], correct: 1 },
  { q: 'Что такое Docker image?', options: ['Контейнер', 'Снимок файловой системы', 'Виртуальная машина', 'Процесс'], correct: 1 },
  { q: 'React useEffect с пустым массивом [] вызывается...', options: ['Каждый рендер', 'Только при размонтировании', 'Только при монтировании', 'Никогда'], correct: 2 },
  { q: 'Какой алгоритм сортировки имеет среднюю сложность O(n log n)?', options: ['Bubble Sort', 'Quick Sort', 'Insertion Sort', 'Bogo Sort'], correct: 1 },
  { q: 'Что означает CAP-теорема?', options: ['Consistency, Availability, Partition tolerance', 'Cache, API, Performance', 'Code, Architecture, Pattern', 'Concurrency, Atomicity, Persistence'], correct: 0 }
];

const QUESTION_TIME_MS = 10000;

function pickRandomQuestions(all, count) {
  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export default function MiniGameDreamInterview({ open, onClose }) {
  const { showToast, reset } = useGameState();
  const { haptic, initData } = useTelegram();
  const [phase, setPhase] = useState('ready');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_MS);
  const [reward, setReward] = useState(null);
  const [success, setSuccess] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [answered, setAnswered] = useState(false);
  const questionTimerRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const intervalRef = useRef(null);
  const finishedRef = useRef(false);

  const resetGame = useCallback(() => {
    finishedRef.current = false;
    setPhase('ready');
    setQuestions([]);
    setCurrentIndex(0);
    setCorrectCount(0);
    setTimeLeft(QUESTION_TIME_MS);
    setReward(null);
    setSuccess(false);
    setAnswered(false);
    if (questionTimerRef.current) clearTimeout(questionTimerRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (open) {
      audioManager.duckForModal();
      resetGame();
    } else {
      audioManager.resumeFromModal();
      resetGame();
    }
    return () => {
      if (questionTimerRef.current) clearTimeout(questionTimerRef.current);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, resetGame]);

  const startGame = useCallback(async () => {
    try {
      const startPayload = await apiRequest('/api/minigame/start', {
        method: 'POST',
        initData,
        body: { gameType: 'dream_interview' }
      });
      if (!startPayload?.canPlay) {
        const reason = startPayload?.reason;
        if (reason === 'level_too_low') {
          showToast(`Доступно с уровня ${startPayload.requiredLevel}`, 'error', 2500);
        } else if (reason === 'cooldown') {
          const mins = Math.ceil((startPayload.remainingMs || 0) / 60000);
          showToast(`Кулдаун: ${mins} мин`, 'error', 2500);
        } else {
          showToast('Мини-игра недоступна', 'error', 2500);
        }
        return;
      }
    } catch (err) {
      showToast('Не удалось начать игру', 'error', 2000);
      return;
    }

    haptic('heavy');
    setPhase('playing');
    setQuestions(pickRandomQuestions(QUESTIONS, 5));
    setCurrentIndex(0);
    setCorrectCount(0);
    setReward(null);
    setSuccess(false);
    setAnswered(false);
    setTimeLeft(QUESTION_TIME_MS);
  }, [haptic, initData, showToast]);

  const finishGame = useCallback(async (finalCorrectCount) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (questionTimerRef.current) clearTimeout(questionTimerRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSuccess(false);
    setPhase('result');

    try {
      setClaiming(true);
      const payload = await apiRequest('/api/minigame/complete', {
        method: 'POST',
        initData,
        body: { gameType: 'dream_interview', score: finalCorrectCount }
      });
      const backendSuccess = payload?.success === true;
      setSuccess(backendSuccess);
      setReward(payload?.reward || null);
      if (backendSuccess) {
        showToast(`Собеседование пройдено! +${payload?.reward?.commits || 200} коммитов`, 'success', 3000);
      } else {
        showToast('Не набрано минимального балла. Попробуй завтра!', 'error', 2500);
      }
      await reset().catch(() => null);
    } catch (err) {
      showToast('Ошибка сохранения результата', 'error', 2000);
    } finally {
      setClaiming(false);
    }
  }, [initData, showToast, reset]);

  const advanceQuestion = useCallback((nextCorrectCount) => {
    if (questionTimerRef.current) clearTimeout(questionTimerRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    setCurrentIndex((idx) => {
      const nextIdx = idx + 1;
      if (nextIdx >= 5) {
        finishGame(nextCorrectCount);
        return idx;
      }
      setAnswered(false);
      setTimeLeft(QUESTION_TIME_MS);
      return nextIdx;
    });
  }, [finishGame]);

  const handleAnswer = useCallback((optionIndex) => {
    if (answered) return;
    setAnswered(true);

    const currentQ = questions[currentIndex];
    const isCorrect = optionIndex === currentQ.correct;
    if (isCorrect) {
      audioManager.play('tap');
      haptic('light');
      setCorrectCount((c) => {
        const nextC = c + 1;
        // Small delay before advancing so user sees feedback
        advanceTimerRef.current = setTimeout(() => advanceQuestion(nextC), 400);
        return nextC;
      });
    } else {
      audioManager.play('error');
      haptic('error');
      advanceTimerRef.current = setTimeout(() => advanceQuestion(correctCount), 400);
    }
  }, [answered, questions, currentIndex, correctCount, advanceQuestion, haptic]);

  // Per-question timer
  useEffect(() => {
    if (phase !== 'playing' || answered) return;
    setTimeLeft(QUESTION_TIME_MS);
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 100) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return t - 100;
      });
    }, 100);
    questionTimerRef.current = setTimeout(() => {
      // Time's up for this question — count as wrong, advance
      setAnswered(true);
      advanceTimerRef.current = setTimeout(() => advanceQuestion(correctCount), 400);
    }, QUESTION_TIME_MS);
    return () => {
      if (questionTimerRef.current) clearTimeout(questionTimerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, currentIndex, answered, correctCount, advanceQuestion]);

  if (!open) return null;

  const progressPct = phase === 'playing' && !answered
    ? Math.max(0, (timeLeft / QUESTION_TIME_MS) * 100)
    : 100;

  const currentQ = questions[currentIndex];

  return h('div', {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'rgba(7, 12, 24, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px 12px',
    },
  }, h('div', {
    onClick: (e) => e.stopPropagation(),
    style: {
      width: 'min(400px, 100%)',
      background: '#0f1b30',
      border: '1px solid #1a3a5c',
      borderRadius: '10px',
      color: '#e6edf7',
      padding: '20px',
      boxShadow: '0 18px 48px rgba(0,0,0,0.4)',
      fontFamily: "'Press Start 2P', 'Courier New', monospace",
    },
  }, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } }, [
      h('strong', { style: { fontSize: '14px' } }, 'Собеседование мечты'),
      h('button', {
        onClick: onClose,
        style: { border: 'none', background: 'transparent', color: '#9eb6d2', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }
      }, '×'),
    ]),

    // Timer bar
    h('div', {
      style: { height: '6px', background: '#0f3460', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }
    }, h('div', {
      style: {
        width: `${progressPct}%`,
        height: '100%',
        background: progressPct > 50 ? '#4ade80' : progressPct > 20 ? '#facc15' : '#ef4444',
        transition: phase === 'playing' && !answered ? 'none' : 'width 0.3s ease',
      }
    })),

    phase === 'ready' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '16px', lineHeight: 1.6 } },
        '5 вопросов по IT.\n10 секунд на каждый.\nНужно 4 правильных ответа.'
      ),
      h('div', { style: { fontSize: '11px', color: '#60a5fa', marginBottom: '16px' } },
        'Награда: +200 коммитов, −30 стресса, фрагмент скина'
      ),
      h('button', {
        onClick: startGame,
        style: {
          minHeight: '48px',
          padding: '0 24px',
          border: '1px solid #4ade80',
          borderRadius: '8px',
          background: '#1a3f25',
          color: '#4ade80',
          fontWeight: 800,
          fontSize: '13px',
          cursor: 'pointer',
        },
      }, '▶ Начать собеседование'),
    ]),

    phase === 'playing' && currentQ && h('div', null, [
      h('div', { style: { fontSize: '11px', color: '#8ba1bb', marginBottom: '12px' } },
        `Вопрос ${currentIndex + 1} / 5 · ${(timeLeft / 1000).toFixed(1)}с`
      ),
      h('div', { style: { fontSize: '13px', fontWeight: 700, marginBottom: '16px', lineHeight: 1.5 } }, currentQ.q),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        currentQ.options.map((opt, i) => h('button', {
          key: i,
          onClick: () => handleAnswer(i),
          disabled: answered,
          style: {
            minHeight: '44px',
            padding: '8px 12px',
            border: '1px solid #30527e',
            borderRadius: '8px',
            background: answered
              ? (i === currentQ.correct ? '#1a3f25' : '#3f1a1a')
              : '#122642',
            color: answered
              ? (i === currentQ.correct ? '#4ade80' : '#fca5a5')
              : '#c7ddf5',
            fontWeight: 600,
            fontSize: '12px',
            cursor: answered ? 'default' : 'pointer',
            textAlign: 'left',
            lineHeight: 1.4,
          },
        }, opt))
      ),
    ]),

    phase === 'result' && h('div', { style: { textAlign: 'center' } }, [
      h('div', { style: { fontSize: '20px', marginBottom: '8px' } }, success ? '🎉' : '😬'),
      h('div', { style: { fontSize: '14px', fontWeight: 700, color: success ? '#4ade80' : '#ef4444', marginBottom: '8px' } },
        success ? 'Ты принят!' : 'Мы перезвоним...'
      ),
      h('div', { style: { fontSize: '12px', color: '#8ba1bb', marginBottom: '12px' } },
        `Правильных ответов: ${correctCount} / 5`
      ),
      reward && h('div', { style: { fontSize: '12px', color: '#60a5fa', marginBottom: '16px' } },
        `+${reward.commits || 0} коммитов · −${reward.depressionRelief || 0} стресса${reward.skinFragment ? ' · фрагмент скина' : ''}`
      ),
      h('button', {
        onClick: onClose,
        style: {
          minHeight: '44px',
          padding: '0 20px',
          border: '1px solid #30527e',
          borderRadius: '8px',
          background: '#122642',
          color: '#c7ddf5',
          fontWeight: 700,
          cursor: 'pointer',
        },
      }, 'Закрыть'),
    ]),
  ]));
}
