const prisma = require('../prismaClient');

class PremiumService {
  // Check if user has premium subscription
  static async isPremium(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscription_status: true,
        subscription_expires_at: true,
      },
    });
    if (!user) return false;
    if (user.subscription_status === 'premium') {
      if (!user.subscription_expires_at) return true;
      return new Date(user.subscription_expires_at) > new Date();
    }
    return false;
  }

  // Get user's current usage and limits
  static async getUserLimits(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscription_status: true,
        subscription_plan: true,
        bills_limit: true,
        participants_limit: true,
        templates_limit: true,
      },
    });
    if (!user) return null;

    // Get current counts
    // Bills created this month
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    const billsCount = await prisma.bill.count({
      where: {
        user_id: userId,
        created_at: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
    });
    // Templates count
    const templatesCount = await prisma.billTemplate.count({
      where: { user_id: userId },
    });
    return {
      subscription_status: user.subscription_status,
      subscription_plan: user.subscription_plan,
      bills: {
        created_this_month: billsCount,
        limit: user.bills_limit,
        remaining: Math.max(0, user.bills_limit - billsCount),
      },
      participants: {
        limit: user.participants_limit,
      },
      templates: {
        count: templatesCount,
        limit: user.templates_limit,
        remaining: Math.max(0, user.templates_limit - templatesCount),
      },
    };
  }

  // Check if user can create a new bill
  static async canCreateBill(userId) {
    const limits = await this.getUserLimits(userId);
    if (!limits) return false;
    if (limits.subscription_status === 'premium') return true;
    return limits.bills.remaining > 0;
  }

  // Check if user can add more participants
  static async canAddParticipants(userId, currentCount) {
    const limits = await this.getUserLimits(userId);
    if (!limits) return false;
    if (limits.subscription_status === 'premium') return true;
    return currentCount < limits.participants.limit;
  }

  // Check if user can create more templates
  static async canCreateTemplate(userId) {
    const limits = await this.getUserLimits(userId);
    if (!limits) return false;
    if (limits.subscription_status === 'premium') return true;
    return limits.templates.remaining > 0;
  }

  // Increment bill count for the month (no longer needed with Prisma count, but kept for compatibility)
  static async incrementBillCount(userId) {
    // No-op: bill count is calculated dynamically
    return;
  }

  // Reset monthly usage (no longer needed with Prisma count, but kept for compatibility)
  static async resetMonthlyUsage() {
    // No-op: bill count is calculated dynamically
    return;
  }

  // Update user subscription
  static async updateSubscription(userId, subscriptionData) {
    const {
      status,
      plan,
      expiresAt,
      stripeCustomerId,
      stripeSubscriptionId,
    } = subscriptionData;
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscription_status: status,
        subscription_plan: plan,
        subscription_expires_at: expiresAt,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        bills_limit: status === 'premium' ? 999999 : 3,
        participants_limit: status === 'premium' ? 999999 : 5,
        templates_limit: status === 'premium' ? 999999 : 2,
      },
    });
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
      custom_branding: isPremium,
    };
  }

  // Get user by Stripe customer ID (for webhook handlers)
  static async getUserByStripeCustomerId(stripeCustomerId) {
    return await prisma.user.findFirst({
      where: { stripe_customer_id: stripeCustomerId },
      select: {
        id: true,
        email: true,
        name: true,
        subscription_status: true,
        subscription_plan: true,
      },
    });
  }
}

module.exports = PremiumService; 