const express = require('express');
const { Client } = require('pg');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt'); // You can use bcrypt to compare password hashes
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
app.post('/register', async (req, res) => {
    const { email, phone, fullName, password } = req.body;

    try {
        // Hash the password before storing it in the database
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert user into PostgreSQL with the hashed password
        const query = 'INSERT INTO users (email, phone, full_name, password_hash) VALUES ($1, $2, $3, $4)';
        const values = [email, phone, fullName, hashedPassword];

        await client.query(query, values);

        res.status(200).send('User registered successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error registering user');
    }
});


// Sample POST request for logging in a user
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const query = 'SELECT * FROM users WHERE email = $1';
        const { rows } = await client.query(query, [email]);

        if (rows.length === 0) {
            return res.status(400).send('Invalid email');
        }

        const user = rows[0];

        // Compare provided password with stored hash
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            res.status(200).send('User logged in successfully');
        } else {
            res.status(400).send('Invalid password');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Error processing login');
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
