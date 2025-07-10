# Stripe Webhook Events Documentation

This document explains all the Stripe webhook events implemented in the Split Generator app for managing subscription lifecycles.

## Webhook Endpoint
- **URL**: `/api/stripe/webhook`
- **Method**: POST
- **Content-Type**: `application/json`
- **Signature Verification**: Uses `STRIPE_WEBHOOK_SECRET` environment variable

## Implemented Events

### 1. `checkout.session.completed`
**When it fires**: After a customer successfully completes the Stripe Checkout process.

**What it does**:
- Extracts the user ID from `client_reference_id`
- Updates the user's subscription status to 'premium'
- Determines the plan type (monthly/yearly) based on the subscription interval
- Stores Stripe customer and subscription IDs
- Logs the successful upgrade

**Database changes**:
- Sets `subscription_status` to 'premium'
- Sets `subscription_plan` to 'monthly' or 'yearly'
- Updates `stripe_customer_id` and `stripe_subscription_id`
- Sets unlimited limits for bills, participants, and templates

### 2. `customer.subscription.updated`
**When it fires**: When a subscription is modified (plan changes, status updates, etc.).

**What it does**:
- Finds the user by Stripe customer ID
- Updates subscription status based on Stripe's status ('active' = 'premium', others = 'free')
- Updates the plan type and expiration date
- Maintains Stripe customer and subscription IDs
- Logs the subscription update

**Common scenarios**:
- User upgrades from monthly to yearly plan
- User downgrades from yearly to monthly plan
- Subscription status changes (active, past_due, canceled, etc.)
- Billing cycle changes

### 3. `customer.subscription.deleted`
**When it fires**: When a subscription is cancelled or deleted.

**What it does**:
- Finds the user by Stripe customer ID
- Sets subscription status to 'free' but maintains expiration date
- Keeps Stripe IDs for reference
- Logs the cancellation with expiration date

**Important**: The user retains premium access until the end of the current billing period (`current_period_end`).

### 4. `customer.subscription.trial_will_end`
**When it fires**: 3 days before a trial subscription ends.

**What it does**:
- Logs the trial ending date
- Placeholder for sending email notifications
- No database changes (trial status is handled by Stripe)

**Use cases**:
- Send reminder emails to users before trial ends
- Prompt users to add payment method
- Offer special trial-to-paid conversion incentives

### 5. `invoice.payment_failed`
**When it fires**: When a payment attempt fails (card declined, insufficient funds, etc.).

**What it does**:
- Logs the payment failure
- Placeholder for sending failure notification emails
- Optionally updates subscription status (commented out)

**Business logic options**:
- **Immediate access revocation**: Set status to 'payment_failed' and revoke premium access
- **Grace period**: Keep premium access for a few days to allow payment retry
- **Email notifications**: Send payment failure emails with retry instructions

### 6. `invoice.payment_succeeded`
**When it fires**: When a payment is successfully processed.

**What it does**:
- Logs the successful payment
- Retrieves the subscription details from Stripe
- Updates subscription status to 'premium'
- Updates expiration date to the new billing period end
- Ensures subscription is properly synced

**Use cases**:
- Renewal payments
- Payment retries after failure
- Manual payment processing

### 7. `customer.subscription.created`
**When it fires**: When a new subscription is created (usually after checkout).

**What it does**:
- Finds the user by Stripe customer ID
- Sets initial subscription status and plan
- Sets expiration date based on billing period
- Stores Stripe customer and subscription IDs
- Logs the subscription creation

**Note**: This event may fire in addition to `checkout.session.completed` for some payment flows.

### 8. `customer.subscription.paused`
**When it fires**: When a subscription is paused (if enabled in Stripe).

**What it does**:
- Logs the subscription pause
- Placeholder for handling paused subscriptions

**Business logic options**:
- **Immediate access revocation**: Remove premium access immediately
- **Grace period**: Keep access until pause period ends
- **User notification**: Send pause confirmation emails

### 9. `customer.subscription.resumed`
**When it fires**: When a paused subscription is resumed.

**What it does**:
- Finds the user by Stripe customer ID
- Restores premium subscription status
- Updates expiration date
- Logs the subscription resume

## Error Handling

All webhook handlers include:
- **Try-catch blocks** for error isolation
- **User lookup validation** with error logging
- **Graceful degradation** - if webhook fails, manual intervention may be needed
- **Comprehensive logging** for debugging and monitoring

## Security Considerations

1. **Signature Verification**: All webhooks verify Stripe signatures using `STRIPE_WEBHOOK_SECRET`
2. **Raw Body Parsing**: Webhook endpoint uses `express.raw()` to preserve signature verification
3. **Error Logging**: Failed webhooks are logged but don't crash the application
4. **User Validation**: All handlers validate user existence before processing

## Monitoring and Debugging

### Log Messages
Each webhook handler logs:
- Success: User ID and action performed
- Errors: Detailed error messages with context
- Unhandled events: Event type for future implementation

### Common Issues
1. **User not found**: Stripe customer ID doesn't match any user
2. **Database errors**: Connection issues or constraint violations
3. **Stripe API errors**: Network issues or invalid subscription data
4. **Signature verification failures**: Incorrect webhook secret or malformed requests

## Environment Variables Required

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...
STRIPE_PRICE_ID_YEARLY=price_...
```

## Testing Webhooks

### Using Stripe CLI
```bash
stripe listen --forward-to localhost:5000/api/stripe/webhook
```

### Test Events
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

## Future Enhancements

1. **Email Notifications**: Implement email sending for important events
2. **Analytics Tracking**: Track subscription lifecycle events for business insights
3. **Grace Period Management**: Implement configurable grace periods for failed payments
4. **Webhook Retry Logic**: Add retry mechanisms for failed webhook processing
5. **Audit Logging**: Detailed audit trail of all subscription changes 