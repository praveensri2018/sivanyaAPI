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
        const query = 'SELECT * FROM public.Users WHERE phone = $1';
        const { rows } = await client.query(query, [mobile]);

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid mobile number' });
        }

        const user = rows[0];

        // Compare provided password with stored hashed password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            res.status(200).json({ message: 'User logged in successfully', user: { id: user.user_id, is_admin:user.is_admin, user_type: user.user_type, name: user.name, email: user.email } });
        } else {
            res.status(400).json({ error: 'Invalid password' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error processing login' });
    }
});



app.post('/register', async (req, res) => {
    const { name, email, password, phone, address, user_type } = req.body;

    if (!name || !email || !password || !user_type) {
        return res.status(400).json({ error: 'Name, email, password, and user type are required' });
    }

    try {
        // Check if the email already exists
        const existingUser = await client.query('SELECT * FROM public.Users WHERE email = $1', [email]);

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert user with is_admin set to false
        const query = `
            INSERT INTO public.Users (name, email, password_hash, phone, address, user_type, is_admin)
            VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING user_id, name, email, user_type, is_admin
        `;
        const values = [name, email, hashedPassword, phone, address, user_type];

        const { rows } = await client.query(query, values);

        res.status(201).json({ message: 'User registered successfully', user: rows[0] });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Error processing registration' });
    }
});





app.post('/categories', async (req, res) => {
    const { category_name } = req.body;

    if (!category_name) {
        return res.status(400).json({ error: 'Category name is required' });
    }

    try {
        const query = 'INSERT INTO ProductCategories (category_name) VALUES ($1) RETURNING *';
        const { rows } = await client.query(query, [category_name]);

        res.status(201).json({ message: 'Category created', category: rows[0] });
    } catch (err) {
        console.error('Error creating category:', err);
        res.status(500).json({ error: 'Error creating category' });
    }
});

// Get All Categories
app.get('/categories', async (req, res) => {
    try {
        const query = 'SELECT * FROM ProductCategories ORDER BY category_name ASC';
        const { rows } = await client.query(query);

        res.status(200).json({ categories: rows });
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({ error: 'Error fetching categories' });
    }
});

// Delete Category
app.delete('/categories/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'DELETE FROM ProductCategories WHERE category_id = $1 RETURNING *';
        const { rows } = await client.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.status(200).json({ message: 'Category deleted successfully' });
    } catch (err) {
        console.error('Error deleting category:', err);
        res.status(500).json({ error: 'Error deleting category' });
    }
});




// New Database sivanyaApk End

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
