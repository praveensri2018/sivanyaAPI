const express = require('express');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();



module.exports = router;
