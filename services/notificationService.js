const nodemailer = require('nodemailer');
const { getQuery } = require('../database');

class NotificationService {
  constructor() {
    // Initialize email transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Email templates
    this.templates = {
      welcome: {
        subject: 'Welcome to Split Generator! 🎉',
        template: 'welcome.html'
      },
      trialEnding: {
        subject: 'Your trial is ending soon ⏰',
        template: 'trial-ending.html'
      },
      paymentFailed: {
        subject: 'Payment failed - Action required ❌',
        template: 'payment-failed.html'
      },
      subscriptionCancelled: {
        subject: 'Subscription cancelled - Access until {date} 📅',
        template: 'subscription-cancelled.html'
      },
      billShared: {
        subject: 'New bill shared with you 📋',
        template: 'bill-shared.html'
      },
      paymentReminder: {
        subject: 'Payment reminder - {amount} owed 💰',
        template: 'payment-reminder.html'
      },
      usageAlert: {
        subject: 'Usage limit approaching ⚠️',
        template: 'usage-alert.html'
      },
      subscriptionUpgraded: {
        subject: 'Welcome to Premium! 🚀',
        template: 'subscription-upgraded.html'
      }
    };
  }

  // Send email notification
  async sendEmail(to, templateName, data = {}) {
    try {
      const template = this.templates[templateName];
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      const htmlContent = await this.renderTemplate(template.template, data);
      const subject = this.renderSubject(template.subject, data);

      const mailOptions = {
        from: `"Split Generator" <${process.env.SMTP_USER}>`,
        to: to,
        subject: subject,
        html: htmlContent,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`Email sent to ${to}: ${templateName}`);
      return result;
    } catch (error) {
      console.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  // Check if user wants to receive specific notification type
  async shouldSendNotification(userId, notificationType) {
    try {
      const user = await getQuery(
        'SELECT email_notifications, notification_preferences FROM users WHERE id = ?',
        [userId]
      );

      if (!user || !user.email_notifications) {
        return false;
      }

      const preferences = user.notification_preferences ? JSON.parse(user.notification_preferences) : {};
      
      // Default to true if preference is not explicitly set to false
      return preferences[notificationType] !== false;
    } catch (error) {
      console.error('Error checking notification preferences:', error);
      // Default to true if there's an error
      return true;
    }
  }

  // Render email template with data
  async renderTemplate(templateName, data) {
    const templates = {
      'welcome.html': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563eb;">Welcome to Split Generator! 🎉</h1>
          <p>Hi ${data.name || 'there'},</p>
          <p>Welcome to Split Generator! We're excited to help you split bills effortlessly.</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Getting Started:</h3>
            <ul>
              <li>📸 Upload receipts using our OCR technology</li>
              <li>👥 Add participants to your bills</li>
              <li>🛒 Assign products to each person</li>
              <li>💰 See who owes what instantly</li>
            </ul>
          </div>
          <p>Ready to start? <a href="${process.env.FRONTEND_URL}/bills/new" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Create Your First Bill</a></p>
          <p>Best regards,<br>The Split Generator Team</p>
        </div>
      `,
      'trial-ending.html': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Your trial is ending soon ⏰</h1>
          <p>Hi ${data.name || 'there'},</p>
          <p>Your premium trial will end on <strong>${data.trialEndDate}</strong>.</p>
          <p>Don't lose access to unlimited bills, advanced analytics, and premium features!</p>
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3>Premium Features:</h3>
            <ul>
              <li>✅ Unlimited bills and participants</li>
              <li>📊 Advanced analytics and insights</li>
              <li>📄 PDF receipt support</li>
              <li>💾 Receipt storage</li>
              <li>🎨 Multiple export formats</li>
            </ul>
          </div>
          <p><a href="${process.env.FRONTEND_URL}/premium" style="background: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Now</a></p>
          <p>Best regards,<br>The Split Generator Team</p>
        </div>
      `,
      'payment-failed.html': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Payment failed - Action required ❌</h1>
          <p>Hi ${data.name || 'there'},</p>
          <p>We couldn't process your payment for your premium subscription.</p>
          <p><strong>Next payment attempt:</strong> ${data.nextAttemptDate}</p>
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3>What you can do:</h3>
            <ul>
              <li>Update your payment method</li>
              <li>Check your card details</li>
              <li>Ensure sufficient funds</li>
            </ul>
          </div>
          <p><a href="${process.env.FRONTEND_URL}/premium" style="background: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Update Payment Method</a></p>
          <p>Best regards,<br>The Split Generator Team</p>
        </div>
      `,
      'subscription-cancelled.html': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6b7280;">Subscription cancelled 📅</h1>
          <p>Hi ${data.name || 'there'},</p>
          <p>Your premium subscription has been cancelled as requested.</p>
          <p><strong>You'll continue to have access to premium features until:</strong> ${data.accessUntil}</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>What happens next:</h3>
            <ul>
              <li>Premium features available until ${data.accessUntil}</li>
              <li>After that, you'll be moved to the free plan</li>
              <li>You can reactivate anytime</li>
            </ul>
          </div>
          <p><a href="${process.env.FRONTEND_URL}/premium" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reactivate Premium</a></p>
          <p>Best regards,<br>The Split Generator Team</p>
        </div>
      `,
      'bill-shared.html': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">New bill shared with you 📋</h1>
          <p>Hi ${data.name || 'there'},</p>
          <p><strong>${data.sharerName}</strong> has shared a bill with you!</p>
          <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
            <h3>Bill Details:</h3>
            <p><strong>Store:</strong> ${data.storeName}</p>
            <p><strong>Total:</strong> $${data.total}</p>
            <p><strong>Your Share:</strong> $${data.yourShare}</p>
            <p><strong>Date:</strong> ${data.date}</p>
          </div>
          <p><a href="${process.env.FRONTEND_URL}/bills/${data.billId}" style="background: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Bill</a></p>
          <p>Best regards,<br>The Split Generator Team</p>
        </div>
      `,
      'payment-reminder.html': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #d97706;">Payment reminder 💰</h1>
          <p>Hi ${data.name || 'there'},</p>
          <p>This is a friendly reminder about your outstanding balance.</p>
          <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d97706;">
            <h3>Outstanding Amount:</h3>
            <p style="font-size: 24px; font-weight: bold; color: #d97706;">$${data.amount}</p>
            <p><strong>Bill:</strong> ${data.billName}</p>
            <p><strong>Due to:</strong> ${data.owedTo}</p>
          </div>
          <p><a href="${process.env.FRONTEND_URL}/bills/${data.billId}" style="background: #d97706; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Bill Details</a></p>
          <p>Best regards,<br>The Split Generator Team</p>
        </div>
      `,
      'usage-alert.html': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Usage limit approaching ⚠️</h1>
          <p>Hi ${data.name || 'there'},</p>
          <p>You're approaching your free plan limits.</p>
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3>Current Usage:</h3>
            <p><strong>Bills this month:</strong> ${data.billsUsed}/${data.billsLimit}</p>
            <p><strong>Templates:</strong> ${data.templatesUsed}/${data.templatesLimit}</p>
          </div>
          <p>Upgrade to Premium for unlimited usage!</p>
          <p><a href="${process.env.FRONTEND_URL}/premium" style="background: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Upgrade Now</a></p>
          <p>Best regards,<br>The Split Generator Team</p>
        </div>
      `,
      'subscription-upgraded.html': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">Welcome to Premium! 🚀</h1>
          <p>Hi ${data.name || 'there'},</p>
          <p>Congratulations! You're now a Premium member.</p>
          <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
            <h3>Your Premium Benefits:</h3>
            <ul>
              <li>✅ Unlimited bills and participants</li>
              <li>📊 Advanced analytics and insights</li>
              <li>📄 PDF receipt support</li>
              <li>💾 Receipt storage</li>
              <li>🎨 Multiple export formats</li>
              <li>⭐ Priority support</li>
            </ul>
          </div>
          <p><a href="${process.env.FRONTEND_URL}/analytics" style="background: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Explore Analytics</a></p>
          <p>Best regards,<br>The Split Generator Team</p>
        </div>
      `
    };

    return templates[templateName] || '<p>Template not found</p>';
  }

  // Render subject line with data
  renderSubject(subject, data) {
    return subject.replace(/\{(\w+)\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  // Notification methods
  async sendWelcomeEmail(userId) {
    if (!(await this.shouldSendNotification(userId, 'welcome'))) {
      return;
    }

    const user = await getQuery('SELECT name, email FROM users WHERE id = ?', [userId]);
    if (!user) return;

    await this.sendEmail(user.email, 'welcome', {
      name: user.name
    });
  }

  async sendTrialEndingEmail(userId, trialEndDate) {
    if (!(await this.shouldSendNotification(userId, 'trialEnding'))) {
      return;
    }

    const user = await getQuery('SELECT name, email FROM users WHERE id = ?', [userId]);
    if (!user) return;

    await this.sendEmail(user.email, 'trialEnding', {
      name: user.name,
      trialEndDate: new Date(trialEndDate * 1000).toLocaleDateString()
    });
  }

  async sendPaymentFailedEmail(userId, invoice) {
    if (!(await this.shouldSendNotification(userId, 'paymentFailed'))) {
      return;
    }

    const user = await getQuery('SELECT name, email FROM users WHERE id = ?', [userId]);
    if (!user) return;

    await this.sendEmail(user.email, 'paymentFailed', {
      name: user.name,
      nextAttemptDate: new Date(invoice.next_payment_attempt * 1000).toLocaleDateString()
    });
  }

  async sendSubscriptionCancelledEmail(userId, accessUntil) {
    if (!(await this.shouldSendNotification(userId, 'subscriptionCancelled'))) {
      return;
    }

    const user = await getQuery('SELECT name, email FROM users WHERE id = ?', [userId]);
    if (!user) return;

    await this.sendEmail(user.email, 'subscriptionCancelled', {
      name: user.name,
      accessUntil: new Date(accessUntil).toLocaleDateString()
    });
  }

  async sendBillSharedEmail(userId, billData) {
    if (!(await this.shouldSendNotification(userId, 'billShared'))) {
      return;
    }

    const user = await getQuery('SELECT name, email FROM users WHERE id = ?', [userId]);
    if (!user) return;

    await this.sendEmail(user.email, 'billShared', {
      name: user.name,
      ...billData
    });
  }

  async sendPaymentReminderEmail(userId, reminderData) {
    if (!(await this.shouldSendNotification(userId, 'paymentReminder'))) {
      return;
    }

    const user = await getQuery('SELECT name, email FROM users WHERE id = ?', [userId]);
    if (!user) return;

    await this.sendEmail(user.email, 'paymentReminder', {
      name: user.name,
      ...reminderData
    });
  }

  async sendUsageAlertEmail(userId, usageData) {
    if (!(await this.shouldSendNotification(userId, 'usageAlert'))) {
      return;
    }

    const user = await getQuery('SELECT name, email FROM users WHERE id = ?', [userId]);
    if (!user) return;

    await this.sendEmail(user.email, 'usageAlert', {
      name: user.name,
      ...usageData
    });
  }

  async sendSubscriptionUpgradedEmail(userId) {
    if (!(await this.shouldSendNotification(userId, 'subscriptionUpgraded'))) {
      return;
    }

    const user = await getQuery('SELECT name, email FROM users WHERE id = ?', [userId]);
    if (!user) return;

    await this.sendEmail(user.email, 'subscriptionUpgraded', {
      name: user.name
    });
  }

  // Batch notification methods
  async sendBulkNotifications(userIds, templateName, data = {}) {
    const users = await getQuery(
      'SELECT id, name, email FROM users WHERE id IN (' + userIds.map(() => '?').join(',') + ')',
      userIds
    );

    const promises = users.map(user => 
      this.sendEmail(user.email, templateName, { name: user.name, ...data })
    );

    return Promise.allSettled(promises);
  }
}

module.exports = new NotificationService(); 