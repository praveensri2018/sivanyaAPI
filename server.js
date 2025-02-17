const express = require('express');
const { Client } = require('pg');
const bodyParser = require('body-parser');
require('dotenv').config(); // Load environment variables

const app = express();
const port = 3000;

// PostgreSQL connection details from .env file
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Connect to PostgreSQL
client.connect();

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Sample POST request for registering a user
app.post('/register', (req, res) => {
    const { email, phone, fullName, passwordHash } = req.body;

    // Insert user into PostgreSQL
    const query = 'INSERT INTO users (email, phone, full_name, password_hash) VALUES ($1, $2, $3, $4)';
    const values = [email, phone, fullName, passwordHash];

    client.query(query, values, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error registering user');
        } else {
            res.status(200).send('User registered successfully');
        }
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
