const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const PremiumService = require('../services/premiumService');

// Stripe integration for premium checkout
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Stripe webhook endpoint
const expressRaw = require('express').raw;

// Attach this route separately in index.js with raw body parsing
const webhookRouter = express.Router();

webhookRouter.post('/webhook', expressRaw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id;
      if (userId) {
        // Set user as premium in DB
        try {
          await PremiumService.updateSubscription(userId, {
            status: 'premium',
            plan: session.mode === 'subscription' && session.display_items && session.display_items[0]?.plan?.interval === 'year' ? 'yearly' : 'monthly',
            expiresAt: null, // Optionally set based on Stripe subscription
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription
          });
          console.log(`User ${userId} upgraded to premium via Stripe.`);
        } catch (err) {
          console.error('Failed to update user after Stripe checkout:', err);
        }
      }
      break;
    }
    // TODO: Handle customer.subscription.updated, .deleted, etc.
    default:
      // Unhandled event type
      break;
  }
  res.json({ received: true });
});

// Get user's subscription status and limits
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const limits = await PremiumService.getUserLimits(req.user.id);
    const features = await PremiumService.getAvailableFeatures(req.user.id);
    
    res.json({
      success: true,
      data: {
        limits,
        features
      }
    });
  } catch (error) {
    console.error('Error getting premium status:', error);
    res.status(500).json({ success: false, message: 'Failed to get premium status' });
  }
});

// Check if user can perform specific actions
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const { action, data } = req.body;
    let canPerform = false;
    let message = '';

    switch (action) {
      case 'create_bill':
        canPerform = await PremiumService.canCreateBill(req.user.id);
        message = canPerform ? 'Can create bill' : 'Monthly bill limit reached';
        break;
        
      case 'add_participants':
        const currentCount = data?.currentCount || 0;
        canPerform = await PremiumService.canAddParticipants(req.user.id, currentCount);
        message = canPerform ? 'Can add participants' : 'Participant limit reached';
        break;
        
      case 'create_template':
        canPerform = await PremiumService.canCreateTemplate(req.user.id);
        message = canPerform ? 'Can create template' : 'Template limit reached';
        break;
        
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    res.json({
      success: true,
      data: {
        canPerform,
        message
      }
    });
  } catch (error) {
    console.error('Error checking premium action:', error);
    res.status(500).json({ success: false, message: 'Failed to check action' });
  }
});

// Upgrade to premium (placeholder for Stripe integration)
router.post('/upgrade', authenticateToken, async (req, res) => {
  try {
    const { plan } = req.body; // 'monthly' or 'yearly'
    
    // This is a placeholder - in real implementation, you'd integrate with Stripe
    // For now, we'll simulate a successful upgrade
    
    const subscriptionData = {
      status: 'premium',
      plan: plan || 'monthly',
      expiresAt: new Date(Date.now() + (plan === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000),
      stripeCustomerId: 'temp_customer_id',
      stripeSubscriptionId: 'temp_subscription_id'
    };

    await PremiumService.updateSubscription(req.user.id, subscriptionData);

    res.json({
      success: true,
      message: 'Successfully upgraded to premium!',
      data: {
        subscription: subscriptionData
      }
    });
  } catch (error) {
    console.error('Error upgrading to premium:', error);
    res.status(500).json({ success: false, message: 'Failed to upgrade to premium' });
  }
});

// Cancel premium subscription
router.post('/cancel', authenticateToken, async (req, res) => {
  try {
    const subscriptionData = {
      status: 'free',
      plan: 'free',
      expiresAt: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null
    };

    await PremiumService.updateSubscription(req.user.id, subscriptionData);

    res.json({
      success: true,
      message: 'Premium subscription cancelled successfully',
      data: {
        subscription: subscriptionData
      }
    });
  } catch (error) {
    console.error('Error cancelling premium:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel premium' });
  }
});

// Create Stripe Checkout session for premium subscription
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { plan } = req.body; // 'monthly' or 'yearly'
    let priceId;
    if (plan === 'yearly') {
      priceId = process.env.STRIPE_PRICE_ID_YEARLY;
    } else {
      priceId = process.env.STRIPE_PRICE_ID_MONTHLY;
    }
    if (!priceId) {
      return res.status(400).json({ success: false, message: 'Invalid plan or Stripe price ID not set' });
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: req.user.email,
      client_reference_id: req.user.id,
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/premium?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/premium?canceled=true`,
    });
    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error('Error creating Stripe Checkout session:', error);
    res.status(500).json({ success: false, message: 'Failed to create checkout session' });
  }
});

// Get premium plans
router.get('/plans', (req, res) => {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      interval: null,
      features: [
        '3 bills per month',
        'Up to 5 participants per bill',
        '2 templates',
        'Basic receipt parsing',
        'PDF export'
      ],
      limits: {
        bills: 3,
        participants: 5,
        templates: 2
      }
    },
    {
      id: 'premium_monthly',
      name: 'Premium',
      price: 4.99,
      interval: 'month',
      features: [
        'Unlimited bills',
        'Unlimited participants',
        'Unlimited templates',
        'PDF receipt support',
        'Receipt storage',
        'Advanced analytics',
        'Multiple export formats',
        'Priority support'
      ],
      limits: {
        bills: 999999,
        participants: 999999,
        templates: 999999
      }
    },
    {
      id: 'premium_yearly',
      name: 'Premium (Yearly)',
      price: 49.99,
      interval: 'year',
      features: [
        'Unlimited bills',
        'Unlimited participants',
        'Unlimited templates',
        'PDF receipt support',
        'Receipt storage',
        'Advanced analytics',
        'Multiple export formats',
        'Priority support',
        '2 months free'
      ],
      limits: {
        bills: 999999,
        participants: 999999,
        templates: 999999
      }
    }
  ];

  res.json({
    success: true,
    data: plans
  });
});

module.exports = { router, webhookRouter }; 