import { createContext } from 'preact';
import { useState, useContext, useCallback, useEffect } from 'preact/hooks';

const STORAGE_KEY = 'coder_survival_v1';

const DEFAULT_STATE = {
  commits: 0,
  energy: 100,
  depression: 0,
  level: 1,
  exp: 0,
  totalTaps: 0,
  lastTapTime: null,
  coffeeCups: 3,
  streakDays: 0,
  lastLoginDate: null
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULT_STATE };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, setState] = useState(loadState);

  // Persist on change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Energy regeneration: +1 every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setState(s => {
        if (s.energy >= 100) return s;
        return { ...s, energy: Math.min(100, s.energy + 1) };
      });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Depression growth: +0.5 per minute when idle
  useEffect(() => {
    const interval = setInterval(() => {
      setState(s => ({
        ...s,
        depression: Math.min(100, s.depression + 0.5)
      }));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Bridge state to Phaser
  useEffect(() => {
    window.__GAME_STATE__ = state;
  }, [state]);

  const tap = useCallback(() => {
    setState(s => {
      if (s.energy <= 0) return s;
      
      const now = Date.now();
      const timeSinceLastTap = s.lastTapTime ? now - s.lastTapTime : Infinity;
      
      // Combo multiplier: faster taps = more commits
      const combo = timeSinceLastTap < 500 ? 2 : 1;
      const commitGain = combo * (1 + Math.floor(s.level / 5));
      
      // Energy cost: 2 per tap, depression relief: -1 per tap
      const newEnergy = Math.max(0, s.energy - 2);
      const newDepression = Math.max(0, s.depression - 1);
      const newExp = s.exp + commitGain;
      const newLevel = Math.floor(newExp / 100) + 1;
      
      return {
        ...s,
        commits: s.commits + commitGain,
        energy: newEnergy,
        depression: newDepression,
        exp: newExp,
        level: newLevel,
        totalTaps: s.totalTaps + 1,
        lastTapTime: now
      };
    });
  }, []);

  const drinkCoffee = useCallback(() => {
    setState(s => {
      if (s.coffeeCups <= 0 || s.energy >= 100) return s;
      return {
        ...s,
        coffeeCups: s.coffeeCups - 1,
        energy: Math.min(100, s.energy + 30),
        depression: Math.max(0, s.depression - 5)
      };
    });
  }, []);

  const value = {
    ...state,
    tap,
    drinkCoffee,
    reset: () => setState({ ...DEFAULT_STATE })
  };

  return h(GameContext.Provider, { value }, children);
}

export function useGameState() {
  return useContext(GameContext);
}
