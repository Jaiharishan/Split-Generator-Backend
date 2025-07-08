const { getQuery, runQuery } = require('../database');

class PremiumService {
  // Check if user has premium subscription
  static async isPremium(userId) {
    const user = await getQuery(
      'SELECT subscription_status, subscription_expires_at FROM users WHERE id = ?',
      [userId]
    );
    
    if (!user) return false;
    
    // Check if subscription is active and not expired
    if (user.subscription_status === 'premium') {
      if (!user.subscription_expires_at) return true; // No expiration date
      return new Date(user.subscription_expires_at) > new Date();
    }
    
    return false;
  }

  // Get user's current usage and limits
  static async getUserLimits(userId) {
    const user = await getQuery(
      `SELECT 
        subscription_status,
        subscription_plan,
        bills_created_this_month,
        bills_limit,
        participants_limit,
        templates_limit
       FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) return null;

    // Get current counts
    const billsCount = await getQuery(
      'SELECT COUNT(*) as count FROM bills WHERE user_id = ? AND strftime("%Y-%m", created_at) = strftime("%Y-%m", "now")',
      [userId]
    );

    const templatesCount = await getQuery(
      'SELECT COUNT(*) as count FROM bill_templates WHERE user_id = ?',
      [userId]
    );

    return {
      subscription_status: user.subscription_status,
      subscription_plan: user.subscription_plan,
      bills: {
        created_this_month: billsCount?.count || 0,
        limit: user.bills_limit,
        remaining: Math.max(0, user.bills_limit - (billsCount?.count || 0))
      },
      participants: {
        limit: user.participants_limit
      },
      templates: {
        count: templatesCount?.count || 0,
        limit: user.templates_limit,
        remaining: Math.max(0, user.templates_limit - (templatesCount?.count || 0))
      }
    };
  }

  // Check if user can create a new bill
  static async canCreateBill(userId) {
    const limits = await this.getUserLimits(userId);
    if (!limits) return false;

    // Premium users have unlimited bills
    if (limits.subscription_status === 'premium') return true;

    // Free users check monthly limit
    return limits.bills.remaining > 0;
  }

  // Check if user can add more participants
  static async canAddParticipants(userId, currentCount) {
    const limits = await this.getUserLimits(userId);
    if (!limits) return false;

    // Premium users have unlimited participants
    if (limits.subscription_status === 'premium') return true;

    // Free users check participant limit
    return currentCount < limits.participants.limit;
  }

  // Check if user can create more templates
  static async canCreateTemplate(userId) {
    const limits = await this.getUserLimits(userId);
    if (!limits) return false;

    // Premium users have unlimited templates
    if (limits.subscription_status === 'premium') return true;

    // Free users check template limit
    return limits.templates.remaining > 0;
  }

  // Increment bill count for the month
  static async incrementBillCount(userId) {
    await runQuery(
      'UPDATE users SET bills_created_this_month = bills_created_this_month + 1 WHERE id = ?',
      [userId]
    );
  }

  // Reset monthly usage (should be called by a cron job)
  static async resetMonthlyUsage() {
    await runQuery('UPDATE users SET bills_created_this_month = 0');
  }

  // Update user subscription
  static async updateSubscription(userId, subscriptionData) {
    const {
      status,
      plan,
      expiresAt,
      stripeCustomerId,
      stripeSubscriptionId
    } = subscriptionData;

    await runQuery(
      `UPDATE users SET 
        subscription_status = ?,
        subscription_plan = ?,
        subscription_expires_at = ?,
        stripe_customer_id = ?,
        stripe_subscription_id = ?,
        bills_limit = ?,
        participants_limit = ?,
        templates_limit = ?
       WHERE id = ?`,
      [
        status,
        plan,
        expiresAt,
        stripeCustomerId,
        stripeSubscriptionId,
        status === 'premium' ? 999999 : 3, // Unlimited for premium
        status === 'premium' ? 999999 : 5, // Unlimited for premium
        status === 'premium' ? 999999 : 2, // Unlimited for premium
        userId
      ]
    );
  }

  // Get premium features available to user
  static async getAvailableFeatures(userId) {
    const isPremium = await this.isPremium(userId);
    
    return {
      unlimited_bills: isPremium,
      unlimited_participants: isPremium,
      unlimited_templates: isPremium,
      pdf_receipts: isPremium,
      receipt_storage: isPremium,
      advanced_analytics: isPremium,
      export_formats: isPremium ? ['pdf', 'csv', 'excel'] : ['pdf'],
      priority_support: isPremium,
      custom_branding: isPremium
    };
  }
}

module.exports = PremiumService; 