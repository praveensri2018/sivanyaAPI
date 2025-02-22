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

// Sample POST request for registering a user
app.post('/register', async (req, res) => {
    const { email, phone, fullName, password } = req.body;

    try {
        // Ensure the password is provided
        if (!password) {
            return res.status(400).send('Password is required');
        }

        // Hash the password before storing it in the database
        const saltRounds = 10; // You can adjust the number of salt rounds if needed
        const hashedPassword = await bcrypt.hash(password, saltRounds); // Ensure both data and salt are passed

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

app.post('/getUser', async (req, res) => {
    const { email } = req.body;

    try {
        const query = 'SELECT full_name, email, phone, address FROM users WHERE email = $1';
        const { rows } = await client.query(query, [email]);

        if (rows.length === 0) {
            return res.status(404).send('User not found');
        }

        res.status(200).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving user details');
    }
});

app.post('/updateUser', async (req, res) => {
    const { email, full_name, phone, address } = req.body;

    try {
        // Ensure that email is provided (as it's the unique identifier)
        if (!email) {
            return res.status(400).send('Email is required to update profile');
        }

        // Update user details in PostgreSQL
        const query = `
            UPDATE users 
            SET full_name = $1, phone = $2, address = $3
            WHERE email = $4
            RETURNING full_name, email, phone, address`;
        const values = [full_name, phone, address, email];

        const { rows } = await client.query(query, values);

        if (rows.length === 0) {
            return res.status(404).send('User not found');
        }

        res.status(200).json({ message: 'Profile updated successfully', user: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error updating user profile');
    }
});

app.post('/getProducts', async (req, res) => {
    try {
        // Query to fetch all products
        const query = 'SELECT id, name, description, price, stock_quantity, image_url FROM products';
        const { rows } = await client.query(query);

        res.status(200).json(rows); // Send the list of products
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving products');
    }
});

// Add Product with Image Upload
app.post('/addProduct', async (req, res) => {
    const { imageUrl,name, description, price, quantity } = req.body;

    try {
        if (!name || !description || !price || !imageUrl|| !quantity) {
            return res.status(400).send('All fields are required');
        }

        // Insert product into database
        const query = `INSERT INTO products (name, description, price, stock_quantity, image_url ) 
                       VALUES ($1, $2, $3, $4, $5) RETURNING *`;
        const values = [name, description, price, quantity, imageUrl];

        const { rows } = await client.query(query, values);
        res.status(200).json({ message: 'Product added successfully', product: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error adding product');
    }
});

app.post('/getProductById', async (req, res) => {
    const { productId } = req.body;

    try {
        if (!productId) {
            return res.status(400).send('Product ID is required');
        }

        // Query to fetch the product by ID
        const query = 'SELECT id, name, description, price, stock_quantity, image_url FROM products WHERE id = $1';
        const { rows } = await client.query(query, [productId]);

        if (rows.length === 0) {
            return res.status(404).send('Product not found');
        }

        res.status(200).json(rows[0]); // Return the product details
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving product details');
    }
});

app.post('/toggleFavorite', async (req, res) => {
    const { userEmail, productId } = req.body;

    try {
        if (!userEmail || !productId) {
            return res.status(400).send('User email and product ID are required');
        }

        // Check if the product is already in favorites
        const checkQuery = `SELECT * FROM favorites WHERE user_email = $1 AND product_id = $2`;
        const { rows } = await client.query(checkQuery, [userEmail, productId]);

        if (rows.length > 0) {
            // If exists, remove it
            const deleteQuery = `DELETE FROM favorites WHERE user_email = $1 AND product_id = $2`;
            await client.query(deleteQuery, [userEmail, productId]);
            return res.status(200).json({ message: 'Product removed from favorites', isFavorite: false });
        } else {
            // Otherwise, add it
            const insertQuery = `INSERT INTO favorites (user_email, product_id) VALUES ($1, $2)`;
            await client.query(insertQuery, [userEmail, productId]);
            return res.status(200).json({ message: 'Product added to favorites', isFavorite: true });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Error toggling favorite product');
    }
});

app.post('/checkFavorite', async (req, res) => {
    const { userEmail, productId } = req.body;

    try {
        if (!userEmail || !productId) {
            return res.status(400).send('User email and product ID are required');
        }

        // Check if the product is in the favorites list
        const query = `SELECT * FROM favorites WHERE user_email = $1 AND product_id = $2`;
        const { rows } = await client.query(query, [userEmail, productId]);

        if (rows.length > 0) {
            return res.status(200).json({ isFavorite: true });
        } else {
            return res.status(200).json({ isFavorite: false });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Error checking favorite status');
    }
});

app.post('/getFavorites', async (req, res) => {
    const { email } = req.body;

    try {
        if (!email) {
            return res.status(400).send('User email is required');
        }

        // Query to fetch user's favorite products
        const query = `
            SELECT p.id, p.name, p.description, p.price, p.stock_quantity, p.image_url
            FROM products p
            JOIN favorites f ON p.id = f.product_id
            WHERE f.user_email = $1
        `;
        const { rows } = await client.query(query, [email]);

        res.status(200).json(rows); // Send the list of favorite products
    } catch (err) {
        console.error(err);
        res.status(500).send('Error retrieving favorite products');
    }
});


// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
