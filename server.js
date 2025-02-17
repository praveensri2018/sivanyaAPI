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

// Sample POST request for logging in a user
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Query the database for the user with the provided email
    const query = 'SELECT * FROM users WHERE email = $1';
    const values = [email];

    client.query(query, values, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error processing login');
            return;
        }

        if (result.rows.length === 0) {
            // User not found
            res.status(400).send('Invalid email or password');
        } else {
            // Compare the provided password with the stored password hash
            const user = result.rows[0]; // Get the first user (only one should exist with the same email)

            // Check if password matches the stored hash
            bcrypt.compare(password, user.password_hash, (err, isMatch) => {
                if (err) {
                    console.error(err);
                    res.status(500).send('Error comparing passwords');
                    return;
                }

                if (isMatch) {
                    // Passwords match, login successful
                    res.status(200).send('User logged in successfully');
                } else {
                    // Passwords do not match
                    res.status(400).send('Invalid email or password');
                }
            });
        }
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
