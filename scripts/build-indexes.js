// scripts/build-indexes.js
require('dotenv').config();
const { connectMongo } = require('../db');
const Message = require('../models/Message');

(async () => {
  const conn = await connectMongo();
  await Message.syncIndexes();
  console.log('✅ Message indexes synced');
  await conn.close();
})();
