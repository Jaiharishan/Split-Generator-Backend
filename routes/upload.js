const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createWorker } = require('tesseract.js');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|tiff/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Upload and process image
router.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imagePath = req.file.path;
    const imageUrl = `/uploads/${req.file.filename}`;

    // Process image with OCR
    const extractedText = await processImageWithOCR(imagePath);
    
    // Parse the extracted text to find products and prices
    const parsedData = parseBillText(extractedText);

    res.json({
      success: true,
      imageUrl,
      extractedText,
      parsedData,
      message: 'Image processed successfully'
    });

  } catch (error) {
    console.error('Error processing image:', error);
    
    // Clean up uploaded file if processing failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Failed to process image',
      message: error.message 
    });
  }
});

// Process image with OCR
async function processImageWithOCR(imagePath) {
  const worker = await createWorker('eng');
  
  try {
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    return text;
  } catch (error) {
    await worker.terminate();
    throw new Error(`OCR processing failed: ${error.message}`);
  }
}

// Parse bill text to extract products and prices
function parseBillText(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const products = [];
  let totalAmount = 0;
  
  // Common patterns for grocery receipts
  const pricePattern = /\$?\d+\.\d{2}/g;
  const quantityPattern = /^\d+\s+/;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip header/footer lines
    if (isHeaderFooter(trimmedLine)) continue;
    
    // Look for total amount
    if (isTotalLine(trimmedLine)) {
      const totalMatch = trimmedLine.match(/\$?\d+\.\d{2}/);
      if (totalMatch) {
        totalAmount = parseFloat(totalMatch[0].replace('$', ''));
      }
      continue;
    }
    
    // Extract product information
    const product = extractProductFromLine(trimmedLine);
    if (product) {
      products.push(product);
    }
  }
  
  return {
    products,
    totalAmount,
    rawText: text
  };
}

function isHeaderFooter(line) {
  const headerFooterKeywords = [
    'receipt', 'store', 'address', 'phone', 'date', 'time',
    'cashier', 'register', 'thank', 'visit', 'card', 'change',
    'subtotal', 'tax', 'total', 'amount', 'due'
  ];
  
  const lowerLine = line.toLowerCase();
  return headerFooterKeywords.some(keyword => lowerLine.includes(keyword));
}

function isTotalLine(line) {
  const totalKeywords = ['total', 'amount due', 'grand total'];
  const lowerLine = line.toLowerCase();
  return totalKeywords.some(keyword => lowerLine.includes(keyword));
}

function extractProductFromLine(line) {
  // Remove common prefixes/suffixes
  let cleanLine = line.replace(/^\d+\s+/, ''); // Remove quantity prefix
  cleanLine = cleanLine.replace(/\s+\d+\.\d{2}$/, ''); // Remove price suffix
  
  // Find price in the line
  const priceMatch = line.match(/\$?\d+\.\d{2}/);
  if (!priceMatch) return null;
  
  const price = parseFloat(priceMatch[0].replace('$', ''));
  const productName = cleanLine.trim();
  
  // Skip if product name is too short or looks like a header
  if (productName.length < 2 || isHeaderFooter(productName)) {
    return null;
  }
  
  return {
    name: productName,
    price: price,
    quantity: 1
  };
}

// Get uploaded image
router.get('/image/:filename', (req, res) => {
  const { filename } = req.params;
  const imagePath = path.join(__dirname, '../uploads', filename);
  
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ error: 'Image not found' });
  }
});

// Delete uploaded image
router.delete('/image/:filename', (req, res) => {
  const { filename } = req.params;
  const imagePath = path.join(__dirname, '../uploads', filename);
  
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
    res.json({ message: 'Image deleted successfully' });
  } else {
    res.status(404).json({ error: 'Image not found' });
  }
});

module.exports = router; 