const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'codersurvival',
    user: process.env.DB_USER || 'codersurvival',
    password: process.env.DB_PASSWORD || 'CSdb2026!'
});

// Telegram WebApp initData validation
function validateInitData(initData) {
    if (!initData) return null;
    
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    
    const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(process.env.BOT_TOKEN || '')
        .digest();
    
    const computedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
    
    if (computedHash !== hash) return null;
    
    const userJson = params.get('user');
    return userJson ? JSON.parse(userJson) : null;
}

// Rate limiting: max 15 taps/sec per user
const userTapWindows = new Map();
function checkRateLimit(userId) {
    const now = Date.now();
    const window = userTapWindows.get(userId);
    
    if (!window || now - window.start > 1000) {
        userTapWindows.set(userId, { start: now, count: 1 });
        return { allowed: true };
    }
    
    if (window.count >= 15) {
        return { allowed: false, reason: 'Rate limit exceeded (>15 taps/sec)' };
    }
    
    window.count++;
    return { allowed: true };
}

// Get or create user
async function getOrCreateUser(telegramUser) {
    const client = await pool.connect();
    try {
        // Try to get existing user
        let result = await client.query(
            'SELECT * FROM users WHERE telegram_id = $1',
            [telegramUser.id]
        );
        
        if (result.rows.length > 0) {
            return result.rows[0];
        }
        
        // Create new user
        result = await client.query(
            `INSERT INTO users (telegram_id, username, first_name, last_name, photo_url)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [telegramUser.id, telegramUser.username, telegramUser.first_name, 
             telegramUser.last_name, telegramUser.photo_url]
        );
        
        const user = result.rows[0];
        
        // Create progression record
        await client.query(
            `INSERT INTO progression (user_id) VALUES ($1)`,
            [user.id]
        );
        
        return user;
    } finally {
        client.release();
    }
}

// Get player state
async function getPlayerState(userId) {
    const result = await pool.query(
        `SELECT p.*, u.telegram_id, u.username, u.first_name
         FROM progression p
         JOIN users u ON p.user_id = u.id
         WHERE u.telegram_id = $1`,
        [userId]
    );
    
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

// Calculate tap reward
function calculateTapReward(state) {
    const tier = state.tier || 1;
    const baseCommits = 1 + Math.floor(tier / 5);
    
    // Combo bonus: if taps within 500ms (handled client-side)
    const combo = state.combo || 1;
    
    return {
        commits: baseCommits * combo,
        energyCost: 2,
        depressionDelta: -1 // tapping reduces depression
    };
}

// API: Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API: Get player state
app.get('/api/state', async (req, res) => {
    try {
        const initData = req.headers['x-telegram-init-data'];
        const user = validateInitData(initData);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid init data' });
        }
        
        const dbUser = await getOrCreateUser(user);
        const state = await getPlayerState(user.id);
        
        res.json({
            user: {
                id: dbUser.id,
                telegram_id: dbUser.telegram_id,
                username: dbUser.username,
                first_name: dbUser.first_name
            },
            game: {
                tier: state.tier,
                commits_total: state.commits_total,
                commits_current: state.commits_current,
                energy: state.energy,
                depression_level: state.depression_level,
                streak_days: state.streak_days
            }
        });
    } catch (err) {
        console.error('State error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// API: Tap
app.post('/api/tap', async (req, res) => {
    try {
        const initData = req.headers['x-telegram-init-data'];
        const user = validateInitData(initData);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid init data' });
        }
        
        // Rate limit check
        const rateCheck = checkRateLimit(user.id);
        if (!rateCheck.allowed) {
            return res.status(429).json({ error: rateCheck.reason });
        }
        
        const dbUser = await getOrCreateUser(user);
        const state = await getPlayerState(user.id);
        
        if (!state) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        // Check energy
        if (state.energy < 2) {
            return res.json({
                success: false,
                reason: 'Not enough energy',
                state: {
                    energy: state.energy,
                    depression_level: state.depression_level
                }
            });
        }
        
        // Calculate reward
        const reward = calculateTapReward(state);
        
        // Update state
        const newEnergy = Math.max(0, state.energy - reward.energyCost);
        const newDepression = Math.max(0, Math.min(100, state.depression_level + reward.depressionDelta));
        const newCommitsTotal = state.commits_total + reward.commits;
        const newCommitsCurrent = state.commits_current + reward.commits;
        
        // Check level up (every 100 commits on current tier)
        const commitsNeeded = 100 * Math.pow(1.8, state.tier - 1);
        let newTier = state.tier;
        let newCommitsCurrentLevel = newCommitsCurrent;
        
        if (newCommitsCurrent >= commitsNeeded) {
            newTier = state.tier + 1;
            newCommitsCurrentLevel = newCommitsCurrent - commitsNeeded;
        }
        
        await pool.query(
            `UPDATE progression 
             SET tier = $1, commits_total = $2, commits_current = $3, 
                 energy = $4, depression_level = $5
             WHERE user_id = $6`,
            [newTier, newCommitsTotal, newCommitsCurrentLevel, newEnergy, newDepression, dbUser.id]
        );
        
        res.json({
            success: true,
            reward: {
                commits: reward.commits,
                energy_delta: -reward.energyCost,
                depression_delta: reward.depressionDelta
            },
            state: {
                tier: newTier,
                commits_total: newCommitsTotal,
                commits_current: newCommitsCurrentLevel,
                energy: newEnergy,
                depression_level: newDepression,
                streak_days: state.streak_days
            }
        });
    } catch (err) {
        console.error('Tap error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// API: Buy item (mock for now)
app.post('/api/buy', async (req, res) => {
    try {
        const initData = req.headers['x-telegram-init-data'];
        const user = validateInitData(initData);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid init data' });
        }
        
        const { item_id } = req.body;
        
        // Mock purchase logic
        const items = {
            'coffee': { stars: 10, energy: 30, depression: -5 },
            'energy_pack': { stars: 50, energy: 100, depression: 0 },
            'antidepressant': { stars: 100, energy: 0, depression: -50 }
        };
        
        const item = items[item_id];
        if (!item) {
            return res.status(400).json({ error: 'Unknown item' });
        }
        
        const dbUser = await getOrCreateUser(user);
        const state = await getPlayerState(user.id);
        
        // Apply effect (mock — no real Stars deduction yet)
        const newEnergy = Math.min(100, state.energy + item.energy);
        const newDepression = Math.max(0, state.depression_level + item.depression);
        
        await pool.query(
            `UPDATE progression 
             SET energy = $1, depression_level = $2
             WHERE user_id = $3`,
            [newEnergy, newDepression, dbUser.id]
        );
        
        // Record purchase
        await pool.query(
            `INSERT INTO purchases (user_id, item_type, stars_amount, status)
             VALUES ($1, $2, $3, 'completed')`,
            [dbUser.id, item_id, item.stars]
        );
        
        res.json({
            success: true,
            item: item_id,
            stars_spent: item.stars,
            state: {
                energy: newEnergy,
                depression_level: newDepression
            }
        });
    } catch (err) {
        console.error('Buy error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// API: Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 100);
        
        const result = await pool.query(
            `SELECT u.username, u.first_name, p.commits_total, p.tier
             FROM progression p
             JOIN users u ON p.user_id = u.id
             ORDER BY p.commits_total DESC
             LIMIT $1`,
            [limit]
        );
        
        res.json({
            leaderboard: result.rows.map((row, index) => ({
                rank: index + 1,
                username: row.username || row.first_name || 'Anonymous',
                commits: parseInt(row.commits_total),
                tier: row.tier
            }))
        });
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Coder Survival API running on port ${PORT}`);
});

module.exports = app;
