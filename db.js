// db.js
const mongoose = require('mongoose');

async function connectMongo(uri) {
  const MONGODB_URI = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/chk';
  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGODB_URI, {
    // Kalau mau custom dbName lewat env, isi MONGODB_DB
    dbName: process.env.MONGODB_DB || undefined,
  });
  return mongoose.connection;
}

module.exports = { connectMongo };
