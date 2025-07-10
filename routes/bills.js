const express = require('express');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../prismaClient');
const { authenticateToken } = require('../middleware/auth');
const PremiumService = require('../services/premiumService');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all bills for the authenticated user
router.get('/', async (req, res) => {
  try {
    const bills = await prisma.bill.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' },
      include: {
        participants: true,
        products: true,
      },
    });
    // Add participant_count and product_count for each bill
    const billsWithCounts = bills.map(bill => ({
      ...bill,
      participant_count: bill.participants.length,
      product_count: bill.products.length,
    }));
    res.json(billsWithCounts);
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

// Get bill by ID with all details (user-specific)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Get bill details (ensure it belongs to the user)
    const bill = await prisma.bill.findFirst({
      where: { id, user_id: req.user.id },
      include: {
        participants: true,
        products: {
          include: {
            productParticipants: {
              include: {
                participant: true,
              },
            },
          },
        },
      },
    });
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    // Format products to match old structure
    const processedProducts = bill.products.map(product => ({
      ...product,
      participant_ids: product.productParticipants.map(pp => pp.participant_id),
      share_percentages: product.productParticipants.map(pp => pp.share_percentage),
      participants: product.productParticipants.map(pp => ({
        ...pp,
        name: pp.participant.name,
        color: pp.participant.color,
      })),
    }));
    res.json({
      ...bill,
      products: processedProducts,
    });
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
});

// Create new bill (user-specific)
router.post('/', async (req, res) => {
  try {
    const { title, total_amount, participants, description } = req.body;
    
    if (!title || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'Missing required fields: title and participants' });
    }
    
    // Check if user can create a new bill
    const canCreateBill = await PremiumService.canCreateBill(req.user.id);
    if (!canCreateBill) {
      return res.status(403).json({ 
        error: 'Monthly bill limit reached',
        message: 'Upgrade to premium for unlimited bills'
      });
    }
    
    // Calculate total amount if not provided
    const calculatedTotal = total_amount || 0;
    
    const billId = uuidv4();
    
    // Create bill with user_id
    await prisma.bill.create({
      data: {
        id: billId,
        user_id: req.user.id,
        title,
        total_amount: calculatedTotal,
        description: description || null,
      },
    });
    
    // Increment bill count for the month
    await PremiumService.incrementBillCount(req.user.id);
    
    // Create participants
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    
    for (let i = 0; i < participants.length; i++) {
      const participantId = uuidv4();
      const color = colors[i % colors.length];
      
      await prisma.participant.create({
        data: {
          id: participantId,
          bill_id: billId,
          name: participants[i],
          color,
        },
      });
    }
    
    res.status(201).json({ 
      id: billId, 
      message: 'Bill created successfully' 
    });
  } catch (error) {
    console.error('Error creating bill:', error);
    res.status(500).json({ error: 'Failed to create bill' });
  }
});

// Update bill (user-specific)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, total_amount, description } = req.body;
    
    const result = await prisma.bill.update({
      where: { id, user_id: req.user.id },
      data: {
        title,
        total_amount,
        description,
        updated_at: new Date(),
      },
    });
    
    if (!result) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    res.json({ message: 'Bill updated successfully' });
  } catch (error) {
    console.error('Error updating bill:', error);
    res.status(500).json({ error: 'Failed to update bill' });
  }
});

// Delete bill (user-specific)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await prisma.bill.delete({
      where: { id, user_id: req.user.id },
    });
    
    if (!result) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Error deleting bill:', error);
    res.status(500).json({ error: 'Failed to delete bill' });
  }
});

// Add product to bill (user-specific)
router.post('/:id/products', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, quantity = 1, participant_ids = [] } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ error: 'Product name and price are required' });
    }
    
    // Verify bill belongs to user
    const bill = await prisma.bill.findFirst({
      where: { id, user_id: req.user.id },
    });
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    const productId = uuidv4();
    
    // Create product
    await prisma.product.create({
      data: {
        id: productId,
        bill_id: id,
        name,
        price,
        quantity,
      },
    });
    
    // Assign participants to product
    for (const participantId of participant_ids) {
      const sharePercentage = 100 / participant_ids.length;
      await prisma.productParticipant.create({
        data: {
          id: uuidv4(),
          product_id: productId,
          participant_id: participantId,
          share_percentage: sharePercentage,
        },
      });
    }
    
    res.status(201).json({ 
      id: productId, 
      message: 'Product added successfully' 
    });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Update product (user-specific)
router.put('/:billId/products/:productId', async (req, res) => {
  try {
    const { billId, productId } = req.params;
    const { name, price, quantity, participant_ids } = req.body;
    
    // Verify bill belongs to user
    const bill = await prisma.bill.findFirst({
      where: { id: billId, user_id: req.user.id },
    });
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    // Update product
    await prisma.product.update({
      where: { id: productId, bill_id: billId },
      data: {
        name,
        price,
        quantity,
      },
    });
    
    // Update participant assignments
    if (participant_ids) {
      // Remove existing assignments
      await prisma.productParticipant.deleteMany({
        where: { product_id: productId },
      });
      
      // Add new assignments
      for (const participantId of participant_ids) {
        const sharePercentage = 100 / participant_ids.length;
        await prisma.productParticipant.create({
          data: {
            id: uuidv4(),
            product_id: productId,
            participant_id: participantId,
            share_percentage: sharePercentage,
          },
        });
      }
    }
    
    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product (user-specific)
router.delete('/:billId/products/:productId', async (req, res) => {
  try {
    const { billId, productId } = req.params;
    
    // Verify bill belongs to user
    const bill = await prisma.bill.findFirst({
      where: { id: billId, user_id: req.user.id },
    });
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    const result = await prisma.product.delete({
      where: { id: productId, bill_id: billId },
    });
    
    if (!result) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Get bill summary with individual totals (user-specific)
router.get('/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify bill belongs to user
    const bill = await prisma.bill.findFirst({
      where: { id, user_id: req.user.id },
    });
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    // Get participants with their totals
    const summary = await prisma.participant.findMany({
      where: { bill_id: id },
      include: {
        productParticipants: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });
    
    // Get bill total
    const billData = await prisma.bill.findFirst({
      where: { id },
      select: { total_amount: true },
    });
    
    // Calculate totals for each participant
    const participantTotals = {};
    summary.forEach(participant => {
      participantTotals[participant.id] = 0;
    });
    
    summary.forEach(participant => {
      participant.productParticipants.forEach(pp => {
        const totalProductCost = pp.product.price * pp.product.quantity;
        const totalSharePercentage = pp.product.productParticipants.reduce((sum, p) => sum + p.share_percentage, 0);
        
        participantTotals[participant.id] += (totalProductCost * pp.share_percentage) / totalSharePercentage;
      });
    });
    
    // Generate export data
    const exportData = {
      bill: {
        ...bill,
        created_at: new Date(bill.created_at).toLocaleDateString(),
        total_amount: parseFloat(bill.total_amount).toFixed(2)
      },
      participants: summary.map(p => ({
        ...p,
        total_owed: parseFloat(participantTotals[p.id] || 0).toFixed(2)
      })),
      products: summary.flatMap(participant => 
        participant.productParticipants.map(pp => ({
          ...pp.product,
          price: parseFloat(pp.product.price).toFixed(2),
          total_cost: parseFloat(pp.product.price * pp.product.quantity).toFixed(2),
          participants: pp.product.productParticipants.map(ppp => ({
            ...ppp,
            share_amount: parseFloat((pp.product.price * pp.product.quantity * ppp.share_percentage) / 
              pp.product.productParticipants.reduce((sum, p) => sum + p.share_percentage, 0)).toFixed(2)
          }))
        }))
      ),
      summary: {
        total_items: summary.flatMap(p => p.productParticipants).length,
        total_participants: summary.length,
        total_amount: parseFloat(bill.total_amount).toFixed(2),
        generated_at: new Date().toLocaleString()
      }
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error fetching bill summary:', error);
    res.status(500).json({ error: 'Failed to fetch bill summary' });
  }
});

// Export bill as PDF
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get bill details (ensure it belongs to the user)
    const bill = await prisma.bill.findFirst({
      where: { id, user_id: req.user.id },
      include: {
        participants: true,
        products: {
          include: {
            productParticipants: {
              include: {
                participant: true,
              },
            },
          },
        },
      },
    });
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    // Get participants
    const participants = await prisma.participant.findMany({
      where: { bill_id: id },
      orderBy: { created_at: 'asc' },
    });
    
    // Get products with their participant assignments
    const products = await prisma.product.findMany({
      where: { bill_id: id },
      include: {
        productParticipants: {
          include: {
            participant: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });
    
    // Process products to include participant details
    const processedProducts = products.map(product => ({
      ...product,
      participant_ids: product.productParticipants.map(pp => pp.participant_id),
      share_percentages: product.productParticipants.map(pp => pp.share_percentage),
      participants: product.productParticipants.map(pp => ({
        ...pp,
        name: pp.participant.name,
        color: pp.participant.color,
      })),
    }));
    
    // Add participant details to each product
    for (let product of processedProducts) {
      if (product.participant_ids.length > 0) {
        const productParticipants = await prisma.productParticipant.findMany({
          where: { product_id: product.id },
          include: {
            participant: true,
          },
        });
        product.participants = productParticipants.map(pp => ({
          ...pp,
          name: pp.participant.name,
          color: pp.participant.color,
        }));
      }
    }
    
    // Calculate totals for each participant
    const participantTotals = {};
    participants.forEach(participant => {
      participantTotals[participant.id] = 0;
    });
    
    processedProducts.forEach(product => {
      if (product.participants.length > 0) {
        const totalProductCost = product.price * product.quantity;
        const totalSharePercentage = product.participants.reduce((sum, p) => sum + p.share_percentage, 0);
        
        product.participants.forEach(participant => {
          const shareAmount = (totalProductCost * participant.share_percentage) / totalSharePercentage;
          participantTotals[participant.participant_id] += shareAmount;
        });
      }
    });
    
    // Generate export data
    const exportData = {
      bill: {
        ...bill,
        created_at: new Date(bill.created_at).toLocaleDateString(),
        total_amount: parseFloat(bill.total_amount).toFixed(2)
      },
      participants: participants.map(p => ({
        ...p,
        total_owed: parseFloat(participantTotals[p.id] || 0).toFixed(2)
      })),
      products: processedProducts.map(p => ({
        ...p,
        price: parseFloat(p.price).toFixed(2),
        total_cost: parseFloat(p.price * p.quantity).toFixed(2),
        participants: p.participants.map(pp => ({
          ...pp,
          share_amount: parseFloat((p.price * p.quantity * pp.share_percentage) / 
            p.participants.reduce((sum, p) => sum + p.share_percentage, 0)).toFixed(2)
        }))
      })),
      summary: {
        total_items: processedProducts.length,
        total_participants: participants.length,
        total_amount: parseFloat(bill.total_amount).toFixed(2),
        generated_at: new Date().toLocaleString()
      }
    };
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting bill:', error);
    res.status(500).json({ error: 'Failed to export bill' });
  }
});

module.exports = router; 