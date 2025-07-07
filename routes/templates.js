const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { runQuery, getQuery, allQuery } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all templates for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const templates = await allQuery(
      `SELECT bt.*, 
              COUNT(tp.id) as participant_count
       FROM bill_templates bt
       LEFT JOIN template_participants tp ON bt.id = tp.template_id
       WHERE bt.user_id = ?
       GROUP BY bt.id
       ORDER BY bt.updated_at DESC`,
      [req.user.id]
    );

    res.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get a specific template with participants
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const template = await getQuery(
      'SELECT * FROM bill_templates WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const participants = await allQuery(
      'SELECT * FROM template_participants WHERE template_id = ? ORDER BY created_at',
      [req.params.id]
    );

    res.json({ template: { ...template, participants } });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create a new template
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, participants } = req.body;

    if (!name || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'Name and participants array are required' });
    }

    const templateId = uuidv4();
    
    // Create template
    await runQuery(
      'INSERT INTO bill_templates (id, user_id, name, description) VALUES (?, ?, ?, ?)',
      [templateId, req.user.id, name, description]
    );

    // Add participants
    for (const participant of participants) {
      const participantId = uuidv4();
      await runQuery(
        'INSERT INTO template_participants (id, template_id, name, color) VALUES (?, ?, ?, ?)',
        [participantId, templateId, participant.name, participant.color]
      );
    }

    // Fetch the created template with participants
    const template = await getQuery(
      'SELECT * FROM bill_templates WHERE id = ?',
      [templateId]
    );

    const templateParticipants = await allQuery(
      'SELECT * FROM template_participants WHERE template_id = ? ORDER BY created_at',
      [templateId]
    );

    res.status(201).json({ 
      template: { ...template, participants: templateParticipants },
      message: 'Template created successfully' 
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Update a template
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, description, participants } = req.body;
    const templateId = req.params.id;

    // Check if template exists and belongs to user
    const existingTemplate = await getQuery(
      'SELECT * FROM bill_templates WHERE id = ? AND user_id = ?',
      [templateId, req.user.id]
    );

    if (!existingTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Update template
    await runQuery(
      'UPDATE bill_templates SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description, templateId]
    );

    // Delete existing participants
    await runQuery('DELETE FROM template_participants WHERE template_id = ?', [templateId]);

    // Add new participants
    for (const participant of participants) {
      const participantId = uuidv4();
      await runQuery(
        'INSERT INTO template_participants (id, template_id, name, color) VALUES (?, ?, ?, ?)',
        [participantId, templateId, participant.name, participant.color]
      );
    }

    // Fetch updated template
    const template = await getQuery(
      'SELECT * FROM bill_templates WHERE id = ?',
      [templateId]
    );

    const templateParticipants = await allQuery(
      'SELECT * FROM template_participants WHERE template_id = ? ORDER BY created_at',
      [templateId]
    );

    res.json({ 
      template: { ...template, participants: templateParticipants },
      message: 'Template updated successfully' 
    });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete a template
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const templateId = req.params.id;

    // Check if template exists and belongs to user
    const existingTemplate = await getQuery(
      'SELECT * FROM bill_templates WHERE id = ? AND user_id = ?',
      [templateId, req.user.id]
    );

    if (!existingTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete template (participants will be deleted due to CASCADE)
    await runQuery('DELETE FROM bill_templates WHERE id = ?', [templateId]);

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Apply template to create a new bill
router.post('/:id/apply', authenticateToken, async (req, res) => {
  try {
    const templateId = req.params.id;
    const { title, total_amount, description } = req.body;

    // Get template with participants
    const template = await getQuery(
      'SELECT * FROM bill_templates WHERE id = ? AND user_id = ?',
      [templateId, req.user.id]
    );

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const participants = await allQuery(
      'SELECT * FROM template_participants WHERE template_id = ? ORDER BY created_at',
      [templateId]
    );

    // Create new bill
    const billId = uuidv4();
    await runQuery(
      'INSERT INTO bills (id, user_id, title, total_amount, description) VALUES (?, ?, ?, ?, ?)',
      [billId, req.user.id, title, total_amount, description]
    );

    // Copy participants from template to bill
    for (const participant of participants) {
      const newParticipantId = uuidv4();
      await runQuery(
        'INSERT INTO participants (id, bill_id, name, color) VALUES (?, ?, ?, ?)',
        [newParticipantId, billId, participant.name, participant.color]
      );
    }

    res.status(201).json({ 
      billId,
      message: 'Bill created from template successfully' 
    });
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

module.exports = router; 