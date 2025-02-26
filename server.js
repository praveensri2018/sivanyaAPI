const express = require('express');
const { Client } = require('pg');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const fileUpload = require('express-fileupload');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const port = 3000;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// PostgreSQL connection
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
client.connect();

// Middleware
app.use(bodyParser.json());
app.use(fileUpload({ useTempFiles: true }));


// New Database sivanyaApk Start

// Sample POST request for logging in a user
app.post('/login', async (req, res) => {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
        return res.status(400).json({ error: 'Mobile and password are required' });
    }

    try {
        const query = 'SELECT * FROM public.Users WHERE phone = $1 AND is_admin = TRUE';
        const { rows } = await client.query(query, [mobile]);

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid mobile number' });
        }

        const user = rows[0];

        // Compare provided password with stored hashed password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            res.status(200).json({ message: 'User logged in successfully', user: { id: user.user_id, name: user.name, email: user.email } });
        } else {
            res.status(400).json({ error: 'Invalid password' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error processing login' });
    }
});









// New Database sivanyaApk End

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
