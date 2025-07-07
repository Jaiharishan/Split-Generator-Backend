const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { runQuery, getQuery } = require('../database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user already exists
    const existingUser = await getQuery('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userId = uuidv4();
    await runQuery(
      'INSERT INTO users (id, email, password_hash, name, provider) VALUES (?, ?, ?, ?, ?)',
      [userId, email, passwordHash, name, 'local']
    );

    // Generate token
    const token = generateToken(userId);

    // Get user data (without password)
    const user = await getQuery(
      'SELECT id, email, name, avatar_url, provider, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get user with password hash
    const user = await getQuery(
      'SELECT id, email, password_hash, name, avatar_url, provider FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user.id);

    // Remove password hash from response
    delete user.password_hash;

    res.json({
      message: 'Login successful',
      token,
      user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// OAuth callback handler
router.post('/oauth/callback', async (req, res) => {
  try {
    const { provider, providerId, email, name, avatarUrl } = req.body;

    if (!provider || !providerId || !email || !name) {
      return res.status(400).json({ error: 'Missing required OAuth data' });
    }

    // Check if user exists with this provider
    let user = await getQuery(
      'SELECT id, email, name, avatar_url, provider FROM users WHERE provider = ? AND provider_id = ?',
      [provider, providerId]
    );

    if (!user) {
      // Check if user exists with this email
      user = await getQuery(
        'SELECT id, email, name, avatar_url, provider FROM users WHERE email = ?',
        [email]
      );

      if (user) {
        // Update existing user with OAuth provider info
        await runQuery(
          'UPDATE users SET provider = ?, provider_id = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [provider, providerId, avatarUrl || user.avatar_url, user.id]
        );
      } else {
        // Create new user
        const userId = uuidv4();
        await runQuery(
          'INSERT INTO users (id, email, name, avatar_url, provider, provider_id, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, email, name, avatarUrl, provider, providerId, true]
        );
        user = await getQuery(
          'SELECT id, email, name, avatar_url, provider FROM users WHERE id = ?',
          [userId]
        );
      }
    }

    // Generate token
    const token = generateToken(user.id);

    res.json({
      message: 'OAuth login successful',
      token,
      user
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Failed to process OAuth login' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getQuery(
      'SELECT id, email, name, avatar_url, provider, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Logout (client-side token removal)
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Change password
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user with password hash
    const user = await getQuery(
      'SELECT id, password_hash FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await runQuery(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router; 