const { Client } = require("pg");
require("dotenv").config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

client.connect()
    .then(() => console.log("🟢 PostgreSQL Connected"))
    .catch(err => console.error("❌ Database Connection Error:", err));

module.exports = client;
