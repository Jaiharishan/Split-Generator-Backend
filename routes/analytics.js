const express = require('express');
const { allQuery, getQuery } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All endpoints require authentication
router.use(authenticateToken);

// 1. Overview: total spent, average bill, active participants
router.get('/overview', async (req, res) => {
  try {
    // Total spent and average bill
    const bills = await allQuery('SELECT total_amount FROM bills WHERE user_id = ?', [req.user.id]);
    const totalSpent = bills.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const avgBill = bills.length > 0 ? totalSpent / bills.length : 0;
    // Active participants (unique across all bills)
    const participants = await allQuery(
      'SELECT DISTINCT name FROM participants WHERE bill_id IN (SELECT id FROM bills WHERE user_id = ?)',
      [req.user.id]
    );
    res.json({
      totalSpent,
      avgBill,
      activeParticipants: participants.length,
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
});

// 2. Spending Over Time (by month)
router.get('/spending-over-time', async (req, res) => {
  try {
    const rows = await allQuery(
      `SELECT strftime('%Y-%m', created_at) as month, SUM(total_amount) as total
       FROM bills WHERE user_id = ?
       GROUP BY month ORDER BY month`,
      [req.user.id]
    );
    res.json(rows.map(r => ({ month: r.month, total: Number(r.total) })));
  } catch (error) {
    console.error('Analytics spending over time error:', error);
    res.status(500).json({ error: 'Failed to fetch spending over time' });
  }
});

// 3. Bill Frequency (bills per month)
router.get('/bill-frequency', async (req, res) => {
  try {
    const rows = await allQuery(
      `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as bills
       FROM bills WHERE user_id = ?
       GROUP BY month ORDER BY month`,
      [req.user.id]
    );
    res.json(rows.map(r => ({ month: r.month, bills: Number(r.bills) })));
  } catch (error) {
    console.error('Analytics bill frequency error:', error);
    res.status(500).json({ error: 'Failed to fetch bill frequency' });
  }
});

// 4. Top Participants (by count across all bills)
router.get('/top-participants', async (req, res) => {
  try {
    const rows = await allQuery(
      `SELECT name, COUNT(*) as count
       FROM participants WHERE bill_id IN (SELECT id FROM bills WHERE user_id = ?)
       GROUP BY name ORDER BY count DESC LIMIT 10`,
      [req.user.id]
    );
    res.json(rows.map(r => ({ id: r.name, value: Number(r.count) })));
  } catch (error) {
    console.error('Analytics top participants error:', error);
    res.status(500).json({ error: 'Failed to fetch top participants' });
  }
});

// 5. Most Common Products (by name)
router.get('/common-products', async (req, res) => {
  try {
    const rows = await allQuery(
      `SELECT name as product, COUNT(*) as count
       FROM products WHERE bill_id IN (SELECT id FROM bills WHERE user_id = ?)
       GROUP BY name ORDER BY count DESC LIMIT 10`,
      [req.user.id]
    );
    res.json(rows.map(r => ({ product: r.product, count: Number(r.count) })));
  } catch (error) {
    console.error('Analytics common products error:', error);
    res.status(500).json({ error: 'Failed to fetch common products' });
  }
});

// 6. Participant Owes/Paid (aggregate amount per participant)
router.get('/participant-owes', async (req, res) => {
  try {
    // For each participant, sum their share across all bills
    const rows = await allQuery(
      `SELECT p.name, COALESCE(SUM(pr.price * pr.quantity * pp.share_percentage / 100), 0) as amount
       FROM participants p
       LEFT JOIN product_participants pp ON p.id = pp.participant_id
       LEFT JOIN products pr ON pp.product_id = pr.id
       WHERE p.bill_id IN (SELECT id FROM bills WHERE user_id = ?)
       GROUP BY p.name
       ORDER BY amount DESC`,
      [req.user.id]
    );
    res.json(rows.map(r => ({ participant: r.name, amount: Number(r.amount) })));
  } catch (error) {
    console.error('Analytics participant owes error:', error);
    res.status(500).json({ error: 'Failed to fetch participant owes' });
  }
});

module.exports = router; 