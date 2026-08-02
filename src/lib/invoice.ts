import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Session, Station, AppSettings } from '../types';
import QRCode from 'qrcode';

export interface InvoiceData {
  customerName: string;
  customerPhone: string;
  pointsEarned: number;
  pointsRedeemed: number;
  loyaltyDiscount: number;
  specialDiscount: number;
  customDiscount: number;
}

export const generateInvoicePDF = async (
  session: Session, 
  station: Station, 
  settings: AppSettings, 
  invoiceData: InvoiceData
): Promise<Blob> => {
  // 80mm receipt width (approx 3.15 inches) for POS thermal printers
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 250] 
  });
  
  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0); 
  doc.text(settings.cafe_name || 'INVOICE', 40, 15, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0); 
  
  const startDate = new Date(session.start_time);
  const endDate = session.end_time ? new Date(session.end_time) : new Date();
  
  doc.text(`Date: ${startDate.toLocaleDateString()}`, 5, 25);
  doc.text(`Time: ${startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`, 5, 30);
  doc.text(`Customer: ${invoiceData.customerName}`, 5, 35);
  doc.text(`Phone: ${invoiceData.customerPhone}`, 5, 40);
  doc.text(`Station: ${station.name}`, 5, 45);
  
  const currencyStr = settings.currency_symbol === '₹' ? 'Rs.' : settings.currency_symbol;

  // Itemize bill
  const tableData: string[][] = [];
  
  // Base cost
  if (session.base_amount > 0) {
    tableData.push(['Gaming Time', '1', `${currencyStr} ${session.base_amount.toFixed(2)}`]);
  }
  
  if (session.extended_minutes && session.extended_minutes > 0) {
    const extCost = (session.extended_minutes / 60) * station.hourly_rate;
    tableData.push([`Extended Time (${session.extended_minutes} mins)`, '1', `${currencyStr} ${extCost.toFixed(2)}`]);
  }
  
  // Food orders
  session.orders.forEach(order => {
    tableData.push([order.name, order.quantity.toString(), `${currencyStr} ${(order.price_at_order * order.quantity).toFixed(2)}`]);
  });
  
  if (invoiceData.loyaltyDiscount > 0) {
    tableData.push([`Loyalty Discount (${invoiceData.pointsRedeemed} pts)`, '1', `- ${currencyStr} ${invoiceData.loyaltyDiscount.toFixed(2)}`]);
  }
  if (invoiceData.specialDiscount > 0) {
    tableData.push(['Special Discount', '1', `- ${currencyStr} ${invoiceData.specialDiscount.toFixed(2)}`]);
  }
  if (invoiceData.customDiscount > 0) {
    tableData.push(['Custom Discount', '1', `- ${currencyStr} ${invoiceData.customDiscount.toFixed(2)}`]);
  }
  
  autoTable(doc, {
    startY: 50,
    margin: { left: 5, right: 5 },
    head: [['Item', 'Qty', 'Amt']],
    body: tableData,
    theme: 'plain',
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: { bottom: 0.5 } },
    styles: { font: 'helvetica', fontSize: 9, textColor: [0, 0, 0], cellPadding: 1 },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 10, halign: 'center' }, 2: { halign: 'right' } }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || 50;
  
  doc.setLineWidth(0.5);
  doc.line(5, finalY + 2, 75, finalY + 2);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total:', 5, finalY + 8);
  doc.text(`${currencyStr} ${session.total_amount.toFixed(2)}`, 75, finalY + 8, { align: 'right' });
  
  if (invoiceData.pointsEarned > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`+ ${invoiceData.pointsEarned} Loyalty Pts!`, 40, finalY + 10, { align: 'center' });
    
    if (settings.loyalty_expiry_enabled) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(`(Expires in ${settings.loyalty_expiry_days || 30} days)`, 40, finalY + 14, { align: 'center' });
      doc.setTextColor(0, 0, 0); // reset
      finalY += 18;
    } else {
      finalY += 15;
    }
  } else {
    finalY += 5;
  }
  
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  const footerMsg = settings.invoice_footer_msg || 'Thank you!';
  doc.text(footerMsg, 40, finalY + 22, { align: 'center' });

  let currentY = finalY + 28;

  if (settings.invoice_qr_type && settings.invoice_qr_type !== 'none') {
    try {
      let qrValue = '';
      if (settings.invoice_qr_type === 'upi' && settings.invoice_upi_id) {
        qrValue = `upi://pay?pa=${settings.invoice_upi_id}&pn=${encodeURIComponent(settings.cafe_name || 'Cafe')}&am=${session.total_amount.toFixed(2)}&cu=INR`;
      } else if (settings.invoice_qr_type === 'review' && settings.google_review_url) {
        qrValue = settings.google_review_url;
      }

      if (qrValue) {
        // Generate QR code as Base64 data URL
        const qrBase64 = await QRCode.toDataURL(qrValue, { errorCorrectionLevel: 'M', margin: 1 });
        // Centered QR Code: 80mm wide page. x = 25, width = 30
        doc.addImage(qrBase64, 'PNG', 25, currentY, 30, 30);
        currentY += 32;
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        if (settings.invoice_qr_type === 'upi') {
          doc.text('Scan to Pay via UPI', 40, currentY, { align: 'center' });
        } else {
          doc.text('Scan to leave a Review!', 40, currentY, { align: 'center' });
        }
      }
    } catch (e) {
      console.error('Error generating QR for invoice:', e);
    }
  }

  return doc.output('blob');
};
