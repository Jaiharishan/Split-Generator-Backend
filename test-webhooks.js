#!/usr/bin/env node

/**
 * Test script for Stripe webhooks
 * 
 * Usage:
 * 1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
 * 2. Run: stripe listen --forward-to localhost:5000/api/stripe/webhook
 * 3. In another terminal, run this script to trigger test events
 */

// Load environment variables first
require('dotenv').config();

// Check if required environment variables are set
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is not set in environment variables');
  console.log('💡 Make sure you have a .env file with your Stripe configuration');
  process.exit(1);
}

if (!process.env.STRIPE_PRICE_ID_MONTHLY) {
  console.error('❌ STRIPE_PRICE_ID_MONTHLY is not set in environment variables');
  process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testWebhooks() {
  console.log('🧪 Testing Stripe webhooks...\n');
  console.log(`Using Stripe key: ${process.env.STRIPE_SECRET_KEY.substring(0, 20)}...`);
  console.log(`Monthly price ID: ${process.env.STRIPE_PRICE_ID_MONTHLY}\n`);

  try {
    // Test 1: Create a test customer
    console.log('1. Creating test customer...');
    const customer = await stripe.customers.create({
      email: 'test@example.com',
      name: 'Test User'
    });
    console.log(`✅ Customer created: ${customer.id}\n`);

    // Test 2: Create a test subscription
    console.log('2. Creating test subscription...');
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID_MONTHLY }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
    console.log(`✅ Subscription created: ${subscription.id}\n`);

    // Test 3: Update subscription (simulate plan change)
    console.log('3. Updating subscription...');
    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      metadata: { test: 'plan_change' }
    });
    console.log(`✅ Subscription updated: ${updatedSubscription.id}\n`);

    // Test 4: Cancel subscription at period end
    console.log('4. Cancelling subscription at period end...');
    const cancelledSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true
    });
    console.log(`✅ Subscription marked for cancellation: ${cancelledSubscription.id}\n`);

    // Test 5: Create a test invoice
    console.log('5. Creating test invoice...');
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      subscription: subscription.id,
      auto_advance: false,
    });
    console.log(`✅ Invoice created: ${invoice.id}\n`);

    console.log('🎉 All test events triggered successfully!');
    console.log('\nCheck your webhook logs to see the events being processed.');
    console.log('\nTo clean up test data, you can delete the customer:');
    console.log(`stripe customers delete ${customer.id}`);

  } catch (error) {
    console.error('❌ Error testing webhooks:', error.message);
    
    if (error.code === 'resource_missing') {
      console.log('\n💡 Make sure you have set up your Stripe price IDs in environment variables:');
      console.log('- STRIPE_PRICE_ID_MONTHLY');
      console.log('- STRIPE_PRICE_ID_YEARLY');
    }
    
    if (error.code === 'authentication_error') {
      console.log('\n💡 Check your STRIPE_SECRET_KEY - it might be invalid or expired');
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testWebhooks();
}

module.exports = { testWebhooks }; 