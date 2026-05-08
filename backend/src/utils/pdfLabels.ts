/**
 * Dispensing label PDF generator.
 *
 * Generates an A4 PDF sheet of dispensing labels, each containing:
 *   - Practice name
 *   - Patient name & reference
 *   - Item name, strength/unit
 *   - Batch number & expiry
 *   - Date dispensed & dispensing nurse
 *   - Doctor name
 *
 * Labels are laid out 2×5 per A4 page (10 labels per page).
 */

import PDFDocument from 'pdfkit';

export interface LabelData {
  practice_name: string;
  patient_name?: string;
  patient_ref?: string;
  item_name: string;
  unit: string;
  quantity: number;
  batch_number?: string;
  expiry_date?: string;
  dispensed_by: string;
  doctor_name: string;
  dispensed_at: string;
}

const LABEL_W    = 252;   // ~89mm
const LABEL_H    = 162;   // ~57mm  (Avery L7163 compatible)
const COLS       = 2;
const ROWS       = 5;
const MARGIN_X   = 18;
const MARGIN_Y   = 30;
const GAP_X      = 9;

export function buildLabelsPDF(labels: LabelData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let labelIdx = 0;

    while (labelIdx < labels.length) {
      doc.addPage();

      for (let row = 0; row < ROWS && labelIdx < labels.length; row++) {
        for (let col = 0; col < COLS && labelIdx < labels.length; col++) {
          const lbl  = labels[labelIdx++];
          const x    = MARGIN_X + col * (LABEL_W + GAP_X);
          const y    = MARGIN_Y + row * LABEL_H;

          // Border
          doc.rect(x + 2, y + 2, LABEL_W - 4, LABEL_H - 4).stroke('#cccccc');

          let ty = y + 8;

          // Practice name (header)
          doc.fontSize(7).fillColor('#555555')
             .text(lbl.practice_name, x + 6, ty, { width: LABEL_W - 12, align: 'right' });
          ty += 11;

          // Item name (large)
          doc.fontSize(10).fillColor('#000000').font('Helvetica-Bold')
             .text(lbl.item_name, x + 6, ty, { width: LABEL_W - 12 });
          ty += doc.currentLineHeight() + 2;

          // Quantity + unit
          doc.fontSize(8).font('Helvetica')
             .text(`Qty: ${lbl.quantity} ${lbl.unit}`, x + 6, ty);
          ty += 11;

          // Patient
          if (lbl.patient_name) {
            doc.fontSize(8).font('Helvetica-Bold')
               .text(`Patient: `, x + 6, ty, { continued: true })
               .font('Helvetica')
               .text(lbl.patient_name + (lbl.patient_ref ? ` (${lbl.patient_ref})` : ''));
            ty += 11;
          }

          // Batch + expiry
          const batchLine = [
            lbl.batch_number ? `Batch: ${lbl.batch_number}` : null,
            lbl.expiry_date  ? `Exp: ${lbl.expiry_date}` : null,
          ].filter(Boolean).join('   ');
          if (batchLine) {
            doc.fontSize(7).fillColor('#333333').font('Helvetica')
               .text(batchLine, x + 6, ty);
            ty += 10;
          }

          // Dispensed by + date
          doc.fontSize(7).fillColor('#333333')
             .text(`Dispensed: ${lbl.dispensed_at.slice(0, 10)} by ${lbl.dispensed_by}`, x + 6, ty);
          ty += 10;

          // Doctor
          doc.fontSize(7)
             .text(`Dr: ${lbl.doctor_name}`, x + 6, ty);
        }
      }
    }

    doc.end();
  });
}
