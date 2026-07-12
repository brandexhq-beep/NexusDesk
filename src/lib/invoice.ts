import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Session, Station, AppSettings } from '../types';

export const generateInvoicePDF = (
  session: Session, 
  station: Station, 
  settings: AppSettings, 
  customerName: string, 
  customerPhone: string
): string => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.text(settings.cafe_name || 'Invoice', 14, 20);
  
  doc.setFontSize(10);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 30);
  doc.text(`Customer: ${customerName}`, 14, 35);
  doc.text(`Phone: ${customerPhone}`, 14, 40);
  doc.text(`Station: ${station.name}`, 14, 45);
  
  // Itemize bill
  const tableData: string[][] = [];
  
  // Base cost
  if (session.base_amount > 0) {
    tableData.push(['Gaming Time', '1', `${settings.currency_symbol} ${session.base_amount}`]);
  }
  
  if (session.extended_minutes && session.extended_minutes > 0) {
    const extCost = (session.extended_minutes / 60) * station.hourly_rate;
    tableData.push([`Extended Time (${session.extended_minutes} mins)`, '1', `${settings.currency_symbol} ${extCost.toFixed(2)}`]);
  }
  
  // Food orders
  session.orders.forEach(order => {
    tableData.push([order.name, order.quantity.toString(), `${settings.currency_symbol} ${(order.price_at_order * order.quantity).toFixed(2)}`]);
  });
  
  autoTable(doc, {
    startY: 55,
    head: [['Description', 'Qty', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229] } // Indigo-600
  });
  
  const finalY = (doc as any).lastAutoTable.finalY || 55;
  
  doc.setFontSize(14);
  doc.text(`Total: ${settings.currency_symbol} ${session.total_amount.toFixed(2)}`, 14, finalY + 10);
  
  doc.setFontSize(10);
  doc.text('Thank you for visiting!', 14, finalY + 25);
  
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
