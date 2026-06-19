const axios = require('axios');
const crypto = require('crypto');

// Setup process.env defaults for the test
process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';
process.env.WHATSAPP_APP_SECRET = 'test_app_secret';

const app = require('./src/app');

async function runTests() {
  console.log('--- RUNNING WEBHOOK INTEGRATION TESTS ---');

  // Start express server on a random port
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://localhost:${port}`;

  try {
    // Test 1: GET verify endpoint success
    console.log('Test 1: GET verify (Success)');
    const res1 = await axios.get(`${baseUrl}/api/messages/webhook?hub.mode=subscribe&hub.challenge=challenge123&hub.verify_token=test_verify_token`);
    console.log('Status:', res1.status);
    console.log('Response:', res1.data);
    if (res1.status !== 200 || res1.data !== 'challenge123') {
      throw new Error('Test 1 failed!');
    }

    // Test 2: GET verify endpoint failure (bad token)
    console.log('Test 2: GET verify (Failure - bad token)');
    try {
      await axios.get(`${baseUrl}/api/messages/webhook?hub.mode=subscribe&hub.challenge=challenge123&hub.verify_token=wrong_token`);
      throw new Error('Test 2 failed: expected failure but got success');
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log('Status:', err.response.status);
      } else {
        throw err;
      }
    }

    // Test 3: POST webhook success (valid signature)
    console.log('Test 3: POST webhook (Success - valid signature)');
    const payload = { object: 'whatsapp_business_account', entry: [] };
    const payloadStr = JSON.stringify(payload);
    const signature = 'sha256=' + crypto.createHmac('sha256', 'test_app_secret').update(payloadStr).digest('hex');

    const res3 = await axios.post(`${baseUrl}/api/messages/webhook`, payload, {
      headers: {
        'x-hub-signature-256': signature,
        'Content-Type': 'application/json'
      }
    });

    console.log('Status:', res3.status);
    console.log('Response:', res3.data);
    if (res3.status !== 200 || !res3.data.success) {
      throw new Error('Test 3 failed!');
    }

    // Test 4: POST webhook failure (invalid signature)
    console.log('Test 4: POST webhook (Failure - signature mismatch)');
    try {
      await axios.post(`${baseUrl}/api/messages/webhook`, payload, {
        headers: {
          'x-hub-signature-256': 'sha256=invalidhash',
          'Content-Type': 'application/json'
        }
      });
      throw new Error('Test 4 failed: expected failure but got success');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('Status:', err.response.status);
      } else {
        throw err;
      }
    }

    console.log('--- ALL WEBHOOK TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
