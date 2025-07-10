const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../prismaClient');
const { generateToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userId = uuidv4();
    await prisma.user.create({
      data: {
        id: userId,
        email,
        password_hash: passwordHash,
        name,
        provider: 'local',
      },
    });

    // Generate token
    const token = generateToken(userId);

    // Get user data (without password)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatar_url: true, provider: true, created_at: true },
    });

    // Send welcome email (non-blocking)
    try {
      await notificationService.sendWelcomeEmail(userId);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail registration if email fails
    }

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
    const user = await prisma.user.findUnique({ where: { email } });

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
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword
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
    let user = await prisma.user.findFirst({ where: { provider, provider_id: providerId } });

    if (!user) {
      // Check if user exists with this email
      user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        // Update existing user with OAuth provider info
        await prisma.user.update({
          where: { id: user.id },
          data: {
            provider,
            provider_id: providerId,
            avatar_url: avatarUrl || user.avatar_url,
            updated_at: new Date(),
          },
        });
      } else {
        // Create new user
        const userId = uuidv4();
        await prisma.user.create({
          data: {
            id: userId,
            email,
            name,
            avatar_url: avatarUrl,
            provider,
            provider_id: providerId,
            email_verified: true,
          },
        });
        user = await prisma.user.findUnique({ where: { id: userId } });
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
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, avatar_url: true, provider: true, created_at: true },
    });

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
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { password_hash: true },
    });

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
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: newPasswordHash,
        updated_at: new Date(),
      },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router; 