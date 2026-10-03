import type { Brief } from '../contracts/brief';
export const sampleInput = 'Delivery report, 08:40. Two refrigerated shipments arrived late. The temperature logger for shipment A reads 9°C for 45 minutes. Shipment B has no logger file. The site manager asks whether either shipment can be released. The product-specific temperature limits are not included in this report.';
export const sampleBrief: Brief = {
  title: 'Two shipments need an evidence check',
  summary: 'Shipment A has a recorded temperature excursion. Shipment B lacks temperature evidence. The report does not establish whether either shipment meets its product-specific limits.',
  evidence: [
    { quote: '9°C for 45 minutes', interpretation: 'A measured excursion requires comparison with the actual product limits.' },
    { quote: 'Shipment B has no logger file.', interpretation: 'The temperature history is missing.' }
  ],
  actions: [
    { action: 'Pause release pending an authorized review', reason: 'The report does not establish compliance.', urgency: 'now' },
    { action: 'Retrieve product limits and the missing logger file', reason: 'These are the evidence gaps blocking a decision.', urgency: 'next' }
  ],
  unknowns: ['Product-specific temperature limits', 'Shipment B temperature history', 'Who has authority to approve release']
};
