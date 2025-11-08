import express from 'express';
import PDFDocument from 'pdfkit';
import Sale from '../models/Sale.js';

const router = express.Router();

// Generate invoice PDF
router.get('/invoice/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('productId sellerId customerId');
    
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    
    // Create PDF with better margins
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4'
    });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${sale._id}.pdf`);
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Helper function to format currency
    const formatCurrency = (amount) => {
      return `Rs. ${amount.toLocaleString('en-PK', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    };
    
    // Colors
    const primaryColor = '#10b981'; // Emerald
    const darkColor = '#1f2937';
    const lightGray = '#f3f4f6';
    
    // ==================== HEADER ====================
    // Company Header with branded box
    doc.fillColor(primaryColor)
       .rect(50, 40, 250, 70)
       .fill();
    
    // Company name
    doc.fillColor('#ffffff')
       .fontSize(32)
       .font('Helvetica-Bold')
       .text('ETIMAD MART', 60, 50);
    
    doc.fillColor('#ffffff')
       .fontSize(11)
       .font('Helvetica')
       .text('Your Trusted Shopping Partner', 60, 85);
    
    // Invoice label on right - stylish box
    doc.fillColor(darkColor)
       .rect(350, 40, 200, 70)
       .fill();
    
    doc.fillColor('#ffffff')
       .fontSize(28)
       .font('Helvetica-Bold')
       .text('INVOICE', 360, 55);
    
    doc.fontSize(10)
       .font('Helvetica')
       .text(`#${sale._id.toString().substring(0, 8).toUpperCase()}`, 360, 90);
    
    // Decorative line
    doc.strokeColor(primaryColor)
       .lineWidth(3)
       .moveTo(50, 120)
       .lineTo(550, 120)
       .stroke();
    
    // Store contact info below header
    doc.fillColor('#6b7280')
       .fontSize(9)
       .font('Helvetica')
       .text('📍 Address: Main Market Street, Karachi, Pakistan', 50, 130)
       .text('📞 Phone: +92-300-1234567 | 📧 Email: info@etimadmart.com', 50, 145);
    
    // ==================== INVOICE INFO ====================
    let yPos = 170;
    
    // Left side - Invoice details
    doc.fillColor(darkColor)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('INVOICE NUMBER:', 50, yPos);
    
    doc.font('Helvetica')
       .text(sale._id.toString().substring(0, 12).toUpperCase(), 160, yPos);
    
    yPos += 20;
    doc.font('Helvetica-Bold')
       .text('INVOICE DATE:', 50, yPos);
    
    doc.font('Helvetica')
       .text(new Date(sale.createdAt).toLocaleDateString('en-PK', {
         year: 'numeric',
         month: 'long',
         day: 'numeric'
       }), 160, yPos);
    
    yPos += 20;
    doc.font('Helvetica-Bold')
       .text('PAYMENT STATUS:', 50, yPos);
    
    doc.fillColor(primaryColor)
       .font('Helvetica-Bold')
       .text('PAID', 160, yPos);
    
    // ==================== CUSTOMER INFO ====================
    yPos = 230;
    
    // Bill To box
    doc.fillColor(lightGray)
       .rect(50, yPos, 230, 120)
       .fill();
    
    doc.fillColor(primaryColor)
       .fontSize(11)
       .font('Helvetica-Bold')
       .text('BILL TO:', 60, yPos + 10);
    
    doc.fillColor(darkColor)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(sale.customerName, 60, yPos + 30);
    
    doc.fontSize(10)
       .font('Helvetica');
    
    if (sale.customerId && sale.customerId.email) {
      doc.text(sale.customerId.email, 60, yPos + 50);
    }
    if (sale.customerId && sale.customerId.phone) {
      doc.text(`Tel: ${sale.customerId.phone}`, 60, yPos + 65);
    }
    if (sale.customerId && sale.customerId.address) {
      doc.text(sale.customerId.address, 60, yPos + 80, { width: 200 });
    }
    
    // Seller Info box
    doc.fillColor('#e0f2fe')
       .rect(320, yPos, 230, 120)
       .fill();
    
    doc.fillColor('#0369a1')
       .fontSize(11)
       .font('Helvetica-Bold')
       .text('SOLD BY:', 330, yPos + 10);
    
    doc.fillColor(darkColor)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(sale.sellerName, 330, yPos + 30);
    
    doc.fontSize(10)
       .font('Helvetica');
    
    if (sale.sellerId && sale.sellerId.email) {
      doc.text(sale.sellerId.email, 330, yPos + 50);
    }
    if (sale.sellerId && sale.sellerId.phone) {
      doc.text(`Tel: ${sale.sellerId.phone}`, 330, yPos + 65);
    }
    
    doc.text(`Commission: ${formatCurrency(sale.commission)}`, 330, yPos + 85)
       .fillColor('#0369a1')
       .font('Helvetica-Bold');
    
    // ==================== ITEMS TABLE ====================
    const tableTop = 350;
    
    // Table header background
    doc.fillColor(darkColor)
       .rect(50, tableTop, 500, 25)
       .fill();
    
    // Table headers
    doc.fillColor('#ffffff')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('PRODUCT / SERVICE', 60, tableTop + 8)
       .text('QTY', 320, tableTop + 8)
       .text('UNIT PRICE', 380, tableTop + 8)
       .text('AMOUNT', 480, tableTop + 8);
    
    // Table content
    const itemY = tableTop + 35;
    
    doc.fillColor(darkColor)
       .fontSize(11)
       .font('Helvetica')
       .text(sale.productName, 60, itemY, { width: 240 })
       .text(sale.quantity.toString(), 320, itemY)
       .text(formatCurrency(sale.unitPrice), 380, itemY)
       .font('Helvetica-Bold')
       .text(formatCurrency(sale.total), 480, itemY);
    
    // Line under item
    doc.strokeColor('#e5e7eb')
       .lineWidth(1)
       .moveTo(50, itemY + 25)
       .lineTo(550, itemY + 25)
       .stroke();
    
    // ==================== TOTALS ====================
    const totalsY = itemY + 50;
    
    // Subtotal
    doc.fillColor('#6b7280')
       .fontSize(10)
       .font('Helvetica')
       .text('SUBTOTAL:', 380, totalsY)
       .fillColor(darkColor)
       .text(formatCurrency(sale.total), 480, totalsY);
    
    // Tax (0% for now)
    doc.fillColor('#6b7280')
       .text('TAX (0%):', 380, totalsY + 20)
       .fillColor(darkColor)
       .text('Rs. 0.00', 480, totalsY + 20);
    
    // Total line
    doc.strokeColor(primaryColor)
       .lineWidth(2)
       .moveTo(380, totalsY + 45)
       .lineTo(550, totalsY + 45)
       .stroke();
    
    // Grand Total
    doc.fillColor(primaryColor)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('TOTAL AMOUNT:', 350, totalsY + 55, { width: 120, align: 'right' });
    
    doc.fontSize(12)
       .text(formatCurrency(sale.total), 475, totalsY + 55, { width: 75, align: 'right' });
    
    // ==================== PAYMENT INFO ====================
    const paymentY = totalsY + 100;
    
    doc.fillColor(lightGray)
       .rect(50, paymentY, 500, 80)
       .fill();
    
    doc.fillColor(darkColor)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('PAYMENT INFORMATION:', 60, paymentY + 10);
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text('Payment Method: Cash / Card', 60, paymentY + 30)
       .text('Payment Status: Paid in Full', 60, paymentY + 45)
       .text(`Transaction Date: ${new Date(sale.createdAt).toLocaleDateString('en-PK')}`, 60, paymentY + 60);
    
    // ==================== FOOTER ====================
    const footerY = 720;
    
    // Footer line
    doc.strokeColor(primaryColor)
       .lineWidth(1)
       .moveTo(50, footerY)
       .lineTo(550, footerY)
       .stroke();
    
    // Thank you message
    doc.fillColor(primaryColor)
       .fontSize(12)
       .font('Helvetica-Bold')
       .text('Thank you for your business!', 50, footerY + 15, { 
         align: 'center',
         width: 500
       });
    
    // Company info
    doc.fillColor(primaryColor)
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('ETIMAD MART', 50, footerY + 30, {
         align: 'center',
         width: 500
       });
    
    doc.fillColor('#6b7280')
       .fontSize(8)
       .font('Helvetica')
       .text('Main Market Street, Karachi | +92-300-1234567 | info@etimadmart.com', 50, footerY + 45, {
         align: 'center',
         width: 500
       });
    
    doc.text('This is a computer-generated invoice. No signature required.', 50, footerY + 60, {
      align: 'center',
      width: 500
    });
    
    // Terms and conditions
    doc.fontSize(7)
       .text('Terms: All sales are final. Returns accepted within 7 days with original receipt.', 50, footerY + 73, {
         align: 'center',
         width: 500
       });
    
    // Finalize PDF
    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
