const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { runQuery, getQuery, allQuery } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const PremiumService = require('../services/premiumService');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all bills for the authenticated user
router.get('/', async (req, res) => {
  try {
    const bills = await allQuery(`
      SELECT 
        b.*,
        COUNT(DISTINCT p.id) as participant_count,
        COUNT(DISTINCT pr.id) as product_count
      FROM bills b
      LEFT JOIN participants p ON b.id = p.bill_id
      LEFT JOIN products pr ON b.id = pr.bill_id
      WHERE b.user_id = ?
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `, [req.user.id]);
    
    res.json(bills);
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
    const bill = await getQuery('SELECT * FROM bills WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    // Get participants
    const participants = await allQuery('SELECT * FROM participants WHERE bill_id = ? ORDER BY created_at', [id]);
    
    // Get products with their participant assignments
    const products = await allQuery(`
      SELECT 
        p.*,
        GROUP_CONCAT(pp.participant_id) as participant_ids,
        GROUP_CONCAT(pp.share_percentage) as share_percentages
      FROM products p
      LEFT JOIN product_participants pp ON p.id = pp.product_id
      WHERE p.bill_id = ?
      GROUP BY p.id
      ORDER BY p.created_at
    `, [id]);
    
    // Process products to include participant details
    const processedProducts = products.map(product => ({
      ...product,
      participant_ids: product.participant_ids ? product.participant_ids.split(',') : [],
      share_percentages: product.share_percentages ? product.share_percentages.split(',').map(Number) : [],
      participants: []
    }));
    
    // Add participant details to each product
    for (let product of processedProducts) {
      if (product.participant_ids.length > 0) {
        const productParticipants = await allQuery(`
          SELECT pp.*, p.name, p.color
          FROM product_participants pp
          JOIN participants p ON pp.participant_id = p.id
          WHERE pp.product_id = ?
        `, [product.id]);
        product.participants = productParticipants;
      }
    }
    
    res.json({
      ...bill,
      participants,
      products: processedProducts
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
    await runQuery(
      'INSERT INTO bills (id, user_id, title, total_amount, description) VALUES (?, ?, ?, ?, ?)',
      [billId, req.user.id, title, calculatedTotal, description || null]
    );
    
    // Increment bill count for the month
    await PremiumService.incrementBillCount(req.user.id);
    
    // Create participants
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    
    for (let i = 0; i < participants.length; i++) {
      const participantId = uuidv4();
      const color = colors[i % colors.length];
      
      await runQuery(
        'INSERT INTO participants (id, bill_id, name, color) VALUES (?, ?, ?, ?)',
        [participantId, billId, participants[i], color]
      );
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
    
    const result = await runQuery(
      'UPDATE bills SET title = ?, total_amount = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [title, total_amount, description, id, req.user.id]
    );
    
    if (result.changes === 0) {
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
    
    const result = await runQuery('DELETE FROM bills WHERE id = ? AND user_id = ?', [id, req.user.id]);
    
    if (result.changes === 0) {
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
    const bill = await getQuery('SELECT id FROM bills WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    const productId = uuidv4();
    
    // Create product
    await runQuery(
      'INSERT INTO products (id, bill_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)',
      [productId, id, name, price, quantity]
    );
    
    // Assign participants to product
    for (const participantId of participant_ids) {
      const sharePercentage = 100 / participant_ids.length;
      await runQuery(
        'INSERT INTO product_participants (id, product_id, participant_id, share_percentage) VALUES (?, ?, ?, ?)',
        [uuidv4(), productId, participantId, sharePercentage]
      );
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
    const bill = await getQuery('SELECT id FROM bills WHERE id = ? AND user_id = ?', [billId, req.user.id]);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    // Update product
    await runQuery(
      'UPDATE products SET name = ?, price = ?, quantity = ? WHERE id = ? AND bill_id = ?',
      [name, price, quantity, productId, billId]
    );
    
    // Update participant assignments
    if (participant_ids) {
      // Remove existing assignments
      await runQuery('DELETE FROM product_participants WHERE product_id = ?', [productId]);
      
      // Add new assignments
      for (const participantId of participant_ids) {
        const sharePercentage = 100 / participant_ids.length;
        await runQuery(
          'INSERT INTO product_participants (id, product_id, participant_id, share_percentage) VALUES (?, ?, ?, ?)',
          [uuidv4(), productId, participantId, sharePercentage]
        );
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
    const bill = await getQuery('SELECT id FROM bills WHERE id = ? AND user_id = ?', [billId, req.user.id]);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    const result = await runQuery(
      'DELETE FROM products WHERE id = ? AND bill_id = ?',
      [productId, billId]
    );
    
    if (result.changes === 0) {
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
    const bill = await getQuery('SELECT id FROM bills WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    // Get participants with their totals
    const summary = await allQuery(`
      SELECT 
        p.id,
        p.name,
        p.color,
        COALESCE(SUM(pr.price * pr.quantity * pp.share_percentage / 100), 0) as total_amount,
        COUNT(DISTINCT pr.id) as items_count
      FROM participants p
      LEFT JOIN product_participants pp ON p.id = pp.participant_id
      LEFT JOIN products pr ON pp.product_id = pr.id AND pr.bill_id = ?
      WHERE p.bill_id = ?
      GROUP BY p.id, p.name, p.color
      ORDER BY p.created_at
    `, [id, id]);
    
    // Get bill total
    const billData = await getQuery('SELECT total_amount FROM bills WHERE id = ?', [id]);
    
    res.json({
      bill_total: billData?.total_amount || 0,
      participants: summary,
      calculated_total: summary.reduce((sum, p) => sum + p.total_amount, 0)
    });
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
    const bill = await getQuery('SELECT * FROM bills WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    // Get participants
    const participants = await allQuery('SELECT * FROM participants WHERE bill_id = ? ORDER BY created_at', [id]);
    
    // Get products with their participant assignments
    const products = await allQuery(`
      SELECT 
        p.*,
        GROUP_CONCAT(pp.participant_id) as participant_ids,
        GROUP_CONCAT(pp.share_percentage) as share_percentages
      FROM products p
      LEFT JOIN product_participants pp ON p.id = pp.product_id
      WHERE p.bill_id = ?
      GROUP BY p.id
      ORDER BY p.created_at
    `, [id]);
    
    // Process products to include participant details
    const processedProducts = products.map(product => ({
      ...product,
      participant_ids: product.participant_ids ? product.participant_ids.split(',') : [],
      share_percentages: product.share_percentages ? product.share_percentages.split(',').map(Number) : [],
      participants: []
    }));
    
    // Add participant details to each product
    for (let product of processedProducts) {
      if (product.participant_ids.length > 0) {
        const productParticipants = await allQuery(`
          SELECT pp.*, p.name, p.color
          FROM product_participants pp
          JOIN participants p ON pp.participant_id = p.id
          WHERE pp.product_id = ?
        `, [product.id]);
        product.participants = productParticipants;
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