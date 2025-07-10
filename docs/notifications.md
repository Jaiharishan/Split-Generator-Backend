# Notification Service Documentation

This document explains the comprehensive notification system implemented in the Split Generator app.

## Overview

The notification service provides email notifications for various app events, with user-controlled preferences and beautiful HTML templates.

## Features

### ✅ Email Notifications
- **Welcome Emails**: Sent to new users upon registration
- **Subscription Lifecycle**: Trial ending, payment failures, cancellations, upgrades
- **Bill Sharing**: When bills are shared with users
- **Payment Reminders**: For outstanding balances
- **Usage Alerts**: When approaching free plan limits

### ✅ User Preferences
- **Global Toggle**: Enable/disable all email notifications
- **Granular Control**: Choose specific notification types
- **Test Emails**: Send test emails to verify setup

### ✅ Professional Templates
- **Responsive Design**: Works on all devices
- **Branded Styling**: Consistent with app design
- **Action Buttons**: Direct links to relevant app sections
- **Personalization**: User names and dynamic content

## Setup

### 1. Environment Variables

Add these to your `.env` file:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# App URLs
FRONTEND_URL=http://localhost:3000
```

### 2. Gmail Setup (Recommended)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
3. **Use the app password** as `SMTP_PASS`

### 3. Alternative Email Providers

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

#### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=your-mailgun-username
SMTP_PASS=your-mailgun-password
```

## API Endpoints

### Get Notification Preferences
```http
GET /api/notifications/preferences
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "emailNotifications": true,
    "preferences": {
      "welcome": true,
      "trialEnding": true,
      "paymentFailed": true,
      "subscriptionCancelled": true,
      "billShared": true,
      "paymentReminder": true,
      "usageAlert": true,
      "subscriptionUpgraded": true
    }
  }
}
```

### Update Notification Preferences
```http
PUT /api/notifications/preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "emailNotifications": true,
  "preferences": {
    "welcome": true,
    "trialEnding": false,
    "paymentFailed": true,
    "subscriptionCancelled": true,
    "billShared": true,
    "paymentReminder": false,
    "usageAlert": true,
    "subscriptionUpgraded": true
  }
}
```

### Send Test Email
```http
POST /api/notifications/test-email
Authorization: Bearer <token>
```

## Email Templates

### 1. Welcome Email
- **Trigger**: User registration
- **Content**: Getting started guide, app features
- **CTA**: "Create Your First Bill"

### 2. Trial Ending
- **Trigger**: 3 days before trial ends
- **Content**: Premium features, upgrade benefits
- **CTA**: "Upgrade Now"

### 3. Payment Failed
- **Trigger**: Stripe payment failure
- **Content**: Next attempt date, troubleshooting steps
- **CTA**: "Update Payment Method"

### 4. Subscription Cancelled
- **Trigger**: Subscription cancellation
- **Content**: Access until date, reactivation info
- **CTA**: "Reactivate Premium"

### 5. Bill Shared
- **Trigger**: When bill is shared with user
- **Content**: Bill details, user's share amount
- **CTA**: "View Bill"

### 6. Payment Reminder
- **Trigger**: Outstanding balance reminder
- **Content**: Amount owed, bill details
- **CTA**: "View Bill Details"

### 7. Usage Alert
- **Trigger**: Approaching free plan limits
- **Content**: Current usage, upgrade benefits
- **CTA**: "Upgrade Now"

### 8. Subscription Upgraded
- **Trigger**: Successful premium upgrade
- **Content**: Premium benefits, feature highlights
- **CTA**: "Explore Analytics"

## Database Schema

### Users Table Additions
```sql
-- Email notification toggle
email_notifications BOOLEAN DEFAULT TRUE

-- Granular notification preferences (JSON)
notification_preferences TEXT DEFAULT "{}"
```

### Preference Structure
```json
{
  "welcome": true,
  "trialEnding": true,
  "paymentFailed": true,
  "subscriptionCancelled": true,
  "billShared": true,
  "paymentReminder": true,
  "usageAlert": true,
  "subscriptionUpgraded": true
}
```

## Integration Points

### 1. User Registration
```javascript
// In auth.js registration route
await notificationService.sendWelcomeEmail(userId);
```

### 2. Stripe Webhooks
```javascript
// In premium.js webhook handlers
await notificationService.sendTrialEndingEmail(user.id, subscription.trial_end);
await notificationService.sendPaymentFailedEmail(user.id, invoice);
await notificationService.sendSubscriptionCancelledEmail(user.id, accessUntil);
await notificationService.sendSubscriptionUpgradedEmail(user.id);
```

### 3. Bill Sharing (Future)
```javascript
// When sharing bills
await notificationService.sendBillSharedEmail(participantId, {
  sharerName: user.name,
  storeName: bill.store,
  total: bill.total,
  yourShare: participantShare,
  date: bill.date,
  billId: bill.id
});
```

## Error Handling

### Graceful Degradation
- **Email failures don't break app functionality**
- **Comprehensive error logging**
- **Fallback to console logging**

### Retry Logic (Future Enhancement)
```javascript
// Example retry mechanism
async sendEmailWithRetry(to, template, data, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.sendEmail(to, template, data);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

## Testing

### 1. Test Email Setup
```bash
# Send test email to verify configuration
curl -X POST http://localhost:5000/api/notifications/test-email \
  -H "Authorization: Bearer <token>"
```

### 2. Test Stripe Webhooks
```bash
# Use the test-webhooks.js script
node test-webhooks.js
```

### 3. Test User Preferences
```bash
# Get preferences
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/notifications/preferences

# Update preferences
curl -X PUT -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"emailNotifications": false}' \
  http://localhost:5000/api/notifications/preferences
```

## Monitoring

### Log Messages
- **Success**: `Email sent to user@example.com: welcome`
- **Failure**: `Failed to send email to user@example.com: Error details`
- **Preference Check**: `User preferences checked for notification type`

### Metrics to Track
- **Delivery Rate**: Successful vs failed emails
- **Open Rate**: Email engagement (requires tracking pixels)
- **Click Rate**: CTA button clicks
- **Unsubscribe Rate**: User preference changes

## Future Enhancements

### 1. Advanced Features
- **Email Templates**: External template files
- **A/B Testing**: Different email versions
- **Scheduling**: Delayed notifications
- **Batching**: Group multiple notifications

### 2. Additional Channels
- **SMS Notifications**: Critical alerts
- **Push Notifications**: Real-time updates
- **In-App Notifications**: Toast messages

### 3. Analytics
- **Email Tracking**: Open/click rates
- **User Engagement**: Response to notifications
- **Conversion Tracking**: Trial-to-paid conversions

### 4. Automation
- **Drip Campaigns**: Welcome series
- **Abandonment Recovery**: Incomplete actions
- **Re-engagement**: Inactive users

## Security Considerations

### 1. Email Security
- **SPF/DKIM**: Email authentication
- **Rate Limiting**: Prevent abuse
- **Unsubscribe Links**: Legal compliance

### 2. Data Privacy
- **GDPR Compliance**: User consent
- **Data Retention**: Email storage policies
- **User Control**: Easy preference management

### 3. Infrastructure
- **SMTP Security**: TLS encryption
- **API Security**: Authentication required
- **Error Handling**: No sensitive data in logs

## Troubleshooting

### Common Issues

1. **Emails not sending**
   - Check SMTP credentials
   - Verify firewall settings
   - Check email provider limits

2. **Authentication errors**
   - Verify app passwords
   - Check 2FA settings
   - Confirm SMTP settings

3. **Template rendering issues**
   - Check template syntax
   - Verify data structure
   - Test with sample data

### Debug Mode
```javascript
// Enable detailed logging
process.env.NODE_ENV = 'development';
// Check console for detailed error messages
``` 