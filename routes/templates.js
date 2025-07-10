const express = require('express');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../prismaClient');
const { authenticateToken } = require('../middleware/auth');
const PremiumService = require('../services/premiumService');

const router = express.Router();

// Get all templates for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const templates = await prisma.billTemplate.findMany({
      where: { user_id: req.user.id },
      orderBy: { updated_at: 'desc' },
      include: {
        participants: true,
      },
    });
    // Add participant_count for each template
    const templatesWithCounts = templates.map(template => ({
      ...template,
      participant_count: template.participants.length,
    }));
    res.json({ templates: templatesWithCounts });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get a specific template with participants
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const template = await prisma.billTemplate.findFirst({
      where: { id: req.params.id, user_id: req.user.id },
      include: { participants: { orderBy: { created_at: 'asc' } } },
    });
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template });
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
    // Check if user can create a new template
    const canCreateTemplate = await PremiumService.canCreateTemplate(req.user.id);
    if (!canCreateTemplate) {
      return res.status(403).json({
        error: 'Template limit reached',
        message: 'Upgrade to premium for unlimited templates',
      });
    }
    const templateId = uuidv4();
    // Create template
    await prisma.billTemplate.create({
      data: {
        id: templateId,
        user_id: req.user.id,
        name,
        description,
      },
    });
    // Add participants
    for (const participant of participants) {
      await prisma.templateParticipant.create({
        data: {
          id: uuidv4(),
          template_id: templateId,
          name: participant.name,
          color: participant.color,
        },
      });
    }
    // Fetch the created template with participants
    const template = await prisma.billTemplate.findFirst({
      where: { id: templateId },
      include: { participants: { orderBy: { created_at: 'asc' } } },
    });
    res.status(201).json({
      template,
      message: 'Template created successfully',
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
    const { id } = req.params;
    // Update template
    await prisma.billTemplate.update({
      where: { id, user_id: req.user.id },
      data: {
        name,
        description,
        updated_at: new Date(),
      },
    });
    if (participants && Array.isArray(participants)) {
      // Remove existing participants
      await prisma.templateParticipant.deleteMany({ where: { template_id: id } });
      // Add new participants
      for (const participant of participants) {
        await prisma.templateParticipant.create({
          data: {
            id: uuidv4(),
            template_id: id,
            name: participant.name,
            color: participant.color,
          },
        });
      }
    }
    // Fetch updated template
    const template = await prisma.billTemplate.findFirst({
      where: { id },
      include: { participants: { orderBy: { created_at: 'asc' } } },
    });
    res.json({ template, message: 'Template updated successfully' });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete a template
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.billTemplate.delete({ where: { id, user_id: req.user.id } });
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
    const template = await prisma.billTemplate.findFirst({
      where: { id: templateId, user_id: req.user.id },
      include: { participants: { orderBy: { created_at: 'asc' } } },
    });
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    // Create new bill
    const billId = uuidv4();
    await prisma.bill.create({
      data: {
        id: billId,
        user_id: req.user.id,
        title,
        total_amount,
        description,
      },
    });
    // Copy participants from template to bill
    for (const participant of template.participants) {
      await prisma.participant.create({
        data: {
          id: uuidv4(),
          bill_id: billId,
          name: participant.name,
          color: participant.color,
        },
      });
    }
    res.status(201).json({
      billId,
      message: 'Bill created from template successfully',
    });
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

module.exports = router; 