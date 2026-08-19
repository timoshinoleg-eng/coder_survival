import { h } from 'preact';
import RandomEventToast from './RandomEventToast.jsx';
import focusHero from '../assets/characters/hero_coder_focus.png';
import strainedHero from '../assets/characters/hero_coder_strained.png';
import collapsedHero from '../assets/characters/hero_coder_collapsed.png';

const FIXTURE_STATES = {
  core: {
    title: 'STABLE BUILD',
    eyebrow: 'RANK · MIDDLE 02',
    commits: '12 480',
    energy: 76,
    stress: 28,
    hero: focusHero,
    condition: 'Терминал стабилен',
    action: 'COMMIT КОДА',
    hint: 'Тапни, чтобы отправить коммит',
  },
  'low-energy': {
    title: 'LOW ENERGY',
    eyebrow: 'RANK · MIDDLE 02',
    commits: '12 480',
    energy: 16,
    stress: 42,
    hero: focusHero,
    condition: 'Кофе поможет восстановиться',
    action: 'НЕТ ЭНЕРГИИ',
    hint: 'Дождись восстановления энергии',
  },
  'high-stress': {
    title: 'HIGH STRESS',
    eyebrow: 'RANK · MIDDLE 02',
    commits: '12 480',
    energy: 46,
    stress: 86,
    hero: strainedHero,
    condition: 'Система под нагрузкой',
    action: 'COMMIT КОДА',
    hint: 'Действуй спокойно и точно',
  },
  recovery: {
    title: 'RECOVERY',
    eyebrow: 'RANK · MIDDLE 02',
    commits: '12 510',
    energy: 58,
    stress: 18,
    hero: focusHero,
    condition: 'Rollback подтверждён',
    action: 'COMMIT КОДА',
    hint: 'Контроль возвращён',
  },
  burnout: {
    title: 'BURNOUT',
    eyebrow: 'RANK · MIDDLE 02',
    commits: '12 480',
    energy: 0,
    stress: 100,
    hero: collapsedHero,
    condition: 'Нужна пауза',
    action: 'ПАУЗА · ВОССТАНОВЛЕНИЕ',
    hint: 'Никаких лишних действий',
  },
};

function FixtureMeter({ label, value, variant }) {
  return h('div', { className: 'visual-fixture__meter' }, [
    h('div', { className: 'visual-fixture__meter-label' }, `${label} ${value}%`),
    h('div', { className: 'visual-fixture__track' },
      h('div', { className: `visual-fixture__fill visual-fixture__fill--${variant}`, style: { width: `${value}%` } }),
    ),
  ]);
}

function FixtureOnboarding() {
  return h('div', { className: 'visual-fixture__onboarding', role: 'dialog', 'aria-label': 'Онбординг' }, [
    h('div', { className: 'visual-fixture__eyebrow' }, '01 / 04 · ВВОДНЫЙ ТУР'),
    h('h1', null, 'ТВОЙ ТЕРМИНАЛ'),
    h('p', null, 'Отправляй коммиты, следи за энергией и не доводи стресс до инцидента.'),
    h('button', { type: 'button' }, 'ПОНЯТНО'),
  ]);
}

export default function VisualFixture() {
  const fixture = new URLSearchParams(window.location.search).get('visual-fixture') || 'core';
  const isIncident = fixture === 'incident';
  const isOnboarding = fixture === 'onboarding';
  const state = FIXTURE_STATES[fixture] || FIXTURE_STATES.core;

  const incidentEvent = {
    eventId: 'fixture-friday-release',
    type: 'friday_release_outage',
    title: 'Пятничный релиз нестабилен',
    description: 'Pipeline дал сбой. Выбери безопасное действие до истечения таймера.',
    timeout: 20,
    options: {
      solve: { label: 'ОТКАТИТЬ РЕЛИЗ' },
      ignore: { label: 'ПРОДОЛЖИТЬ' },
    },
  };

  return h('main', { className: 'visual-fixture', 'data-fixture': fixture }, [
    h('header', { className: 'visual-fixture__hud' }, [
      h('div', null, [
        h('div', { className: 'visual-fixture__eyebrow' }, state.eyebrow),
        h('div', { className: 'visual-fixture__title' }, state.title),
      ]),
      h('div', { className: 'visual-fixture__commits' }, [
        h('strong', null, state.commits),
        h('span', null, 'коммитов'),
      ]),
    ]),
    h('section', { className: 'visual-fixture__scene', 'aria-label': state.condition }, [
      h('div', { className: 'visual-fixture__monitor' }, [
        h('span', null, '> git status'),
        h('span', null, isIncident ? 'ALERT: pipeline failed' : 'working tree clean'),
        h('span', null, '█'),
      ]),
      h('img', { src: state.hero, alt: 'Никита за рабочим столом', className: 'visual-fixture__hero' }),
      h('div', { className: 'visual-fixture__desk' }),
      h('div', { className: 'visual-fixture__condition' }, state.condition),
    ]),
    h('section', { className: 'visual-fixture__bottom' }, [
      h(FixtureMeter, { label: 'ЭНЕРГИЯ', value: state.energy, variant: 'energy' }),
      h(FixtureMeter, { label: 'СТРЕСС', value: state.stress, variant: state.stress >= 75 ? 'stress' : 'amber' }),
      h('button', { type: 'button', className: `visual-fixture__terminal ${state.energy === 0 || fixture === 'burnout' ? 'visual-fixture__terminal--disabled' : ''}` }, [
        h('span', null, 'TERMINAL / COMMIT'),
        h('strong', null, state.action),
        h('small', null, state.hint),
      ]),
    ]),
    isOnboarding && h(FixtureOnboarding),
    isIncident && h(RandomEventToast, { event: incidentEvent, onChoice: () => {}, onTap: () => {} }),
  ]);
}
