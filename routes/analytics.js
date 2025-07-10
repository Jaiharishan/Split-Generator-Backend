const express = require('express');
const prisma = require('../prismaClient');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All endpoints require authentication
router.use(authenticateToken);

// 1. Overview: total spent, average bill, active participants
router.get('/overview', async (req, res) => {
  try {
    // Total spent and average bill
    const bills = await prisma.bill.findMany({
      where: { user_id: req.user.id },
      select: { total_amount: true },
    });
    const totalSpent = bills.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const avgBill = bills.length > 0 ? totalSpent / bills.length : 0;
    // Active participants (unique across all bills)
    const participants = await prisma.participant.findMany({
      where: {
        bill: { user_id: req.user.id },
      },
      select: { name: true },
      distinct: ['name'],
    });
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
    const bills = await prisma.bill.findMany({
      where: { user_id: req.user.id },
      select: { total_amount: true, created_at: true },
      orderBy: { created_at: 'asc' },
    });
    // Group by YYYY-MM
    const monthlyTotals = {};
    for (const bill of bills) {
      const date = new Date(bill.created_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyTotals[month]) monthlyTotals[month] = 0;
      monthlyTotals[month] += bill.total_amount || 0;
    }
    const result = Object.entries(monthlyTotals).map(([month, total]) => ({ month, total }));
    res.json(result);
  } catch (error) {
    console.error('Analytics spending over time error:', error);
    res.status(500).json({ error: 'Failed to fetch spending over time' });
  }
});

// 3. Bill Frequency (bills per month)
router.get('/bill-frequency', async (req, res) => {
  try {
    const bills = await prisma.bill.findMany({
      where: { user_id: req.user.id },
      select: { created_at: true },
      orderBy: { created_at: 'asc' },
    });
    // Group by YYYY-MM
    const monthlyCounts = {};
    for (const bill of bills) {
      const date = new Date(bill.created_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyCounts[month]) monthlyCounts[month] = 0;
      monthlyCounts[month] += 1;
    }
    const result = Object.entries(monthlyCounts).map(([month, bills]) => ({ month, bills }));
    res.json(result);
  } catch (error) {
    console.error('Analytics bill frequency error:', error);
    res.status(500).json({ error: 'Failed to fetch bill frequency' });
  }
});

// 4. Top Participants (by count across all bills)
router.get('/top-participants', async (req, res) => {
  try {
    const participants = await prisma.participant.groupBy({
      by: ['name'],
      where: {
        bill: { user_id: req.user.id },
      },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take: 10,
    });
    res.json(participants.map(r => ({ id: r.name, value: r._count.name })));
  } catch (error) {
    console.error('Analytics top participants error:', error);
    res.status(500).json({ error: 'Failed to fetch top participants' });
  }
});

// 5. Most Common Products (by name)
router.get('/common-products', async (req, res) => {
  try {
    const products = await prisma.product.groupBy({
      by: ['name'],
      where: {
        bill: { user_id: req.user.id },
      },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
      take: 10,
    });
    res.json(products.map(r => ({ product: r.name, count: r._count.name })));
  } catch (error) {
    console.error('Analytics common products error:', error);
    res.status(500).json({ error: 'Failed to fetch common products' });
  }
});

// 6. Participant Owes/Paid (aggregate amount per participant)
router.get('/participant-owes', async (req, res) => {
  try {
    // Get all participants for user's bills
    const participants = await prisma.participant.findMany({
      where: {
        bill: { user_id: req.user.id },
      },
      select: { id: true, name: true },
    });
    // For each participant, sum their share across all products
    const result = [];
    for (const participant of participants) {
      // Get all product_participants for this participant
      const productParticipants = await prisma.productParticipant.findMany({
        where: { participant_id: participant.id },
        include: { product: true },
      });
      const amount = productParticipants.reduce((sum, pp) => {
        if (pp.product) {
          return sum + (pp.product.price * pp.product.quantity * (pp.share_percentage || 0) / 100);
        }
        return sum;
      }, 0);
      result.push({ participant: participant.name, amount });
    }
    // Sort by amount descending
    result.sort((a, b) => b.amount - a.amount);
    res.json(result);
  } catch (error) {
    console.error('Analytics participant owes error:', error);
    res.status(500).json({ error: 'Failed to fetch participant owes' });
  }
});

module.exports = router; 