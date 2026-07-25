import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Session, Station, AppSettings } from '../types';

export interface InvoiceData {
  customerName: string;
  customerPhone: string;
  pointsEarned: number;
  pointsRedeemed: number;
  discountAmount: number;
}

export const generateInvoicePDF = (
  session: Session, 
  station: Station, 
  settings: AppSettings, 
  invoiceData: InvoiceData
): string => {
  const doc = new jsPDF();
  
  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(31, 41, 55); // Gray-800
  doc.text(settings.cafe_name || 'INVOICE', 14, 20);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99); // Gray-600
  
  // Format dates
  const startDate = new Date(session.start_time);
  const endDate = session.end_time ? new Date(session.end_time) : new Date();
  
  doc.text(`Date: ${startDate.toLocaleDateString()}`, 14, 30);
  doc.text(`Time: ${startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`, 14, 35);
  doc.text(`Customer: ${invoiceData.customerName}`, 14, 40);
  doc.text(`Phone: ${invoiceData.customerPhone}`, 14, 45);
  doc.text(`Station: ${station.name}`, 14, 50);
  
  // jsPDF standard fonts don't support unicode ₹ well, use Rs. instead for PDF
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
  
  if (invoiceData.discountAmount > 0) {
    tableData.push([`Loyalty Discount (${invoiceData.pointsRedeemed} pts)`, '1', `- ${currencyStr} ${invoiceData.discountAmount.toFixed(2)}`]);
  }
  
  autoTable(doc, {
    startY: 60,
    head: [['Description', 'Qty', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' }, // Indigo-600
    styles: { font: 'helvetica', fontSize: 10, textColor: [55, 65, 81] },
    alternateRowStyles: { fillColor: [249, 250, 251] }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || 60;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39); // Gray-900
  doc.text(`Total: ${currencyStr} ${session.total_amount.toFixed(2)}`, 14, finalY + 12);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(22, 163, 74); // Green-600
  doc.text(`+ ${invoiceData.pointsEarned} Loyalty Points Earned!`, 14, finalY + 22);
  
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128); // Gray-500
  doc.text('Thank you for playing with us!', 14, finalY + 32);
  
  // Optional Logo Image if it's a valid data URL
  if (settings.cafe_logo_url && settings.cafe_logo_url.startsWith('data:image')) {
    try {
      doc.addImage(settings.cafe_logo_url, 'PNG', 160, 10, 30, 30);
    } catch (e) {
      console.error('Failed to render logo to PDF', e);
    }
  }

  return doc.output('datauristring');
};
