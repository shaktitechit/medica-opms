/**
 * @fileoverview Configuration (cors).
 * @module config/cors
 */
module.exports = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5002',
    'http://opms.medicaent.in',
    'https://opms.medicaent.in'
  ],
  credentials: true,
};
