const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const prisma = require('../prismaClient');
const notificationService = require('../services/notificationService');

// Get user's notification preferences
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        email_notifications: true,
        notification_preferences: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const preferences = user.notification_preferences ? JSON.parse(user.notification_preferences) : {};

    res.json({
      success: true,
      data: {
        emailNotifications: user.email_notifications,
        preferences: {
          welcome: preferences.welcome !== false,
          trialEnding: preferences.trialEnding !== false,
          paymentFailed: preferences.paymentFailed !== false,
          subscriptionCancelled: preferences.subscriptionCancelled !== false,
          billShared: preferences.billShared !== false,
          paymentReminder: preferences.paymentReminder !== false,
          usageAlert: preferences.usageAlert !== false,
          subscriptionUpgraded: preferences.subscriptionUpgraded !== false
        }
      }
    });
  } catch (error) {
    console.error('Error getting notification preferences:', error);
    res.status(500).json({ success: false, message: 'Failed to get notification preferences' });
  }
});

// Update user's notification preferences
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const { emailNotifications, preferences } = req.body;

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notification_preferences: true },
    });

    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const currentPreferences = currentUser.notification_preferences ? JSON.parse(currentUser.notification_preferences) : {};
    const updatedPreferences = { ...currentPreferences, ...preferences };

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        email_notifications: emailNotifications,
        notification_preferences: JSON.stringify(updatedPreferences),
      },
    });

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: {
        emailNotifications,
        preferences: updatedPreferences
      }
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification preferences' });
  }
});

// Send test email
router.post('/test-email', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, email: true, email_notifications: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.email_notifications) {
      return res.status(400).json({ success: false, message: 'Email notifications are disabled' });
    }

    // Send a test email
    await notificationService.sendEmail(user.email, 'welcome', {
      name: user.name
    });

    res.json({
      success: true,
      message: 'Test email sent successfully'
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ success: false, message: 'Failed to send test email' });
  }
});

// Get notification history (for future implementation)
router.get('/history', authenticateToken, async (req, res) => {
  try {
    // This would query a notifications table if you want to track sent notifications
    // For now, return empty array
    res.json({
      success: true,
      data: {
        notifications: []
      }
    });
  } catch (error) {
    console.error('Error getting notification history:', error);
    res.status(500).json({ success: false, message: 'Failed to get notification history' });
  }
});

module.exports = router; 