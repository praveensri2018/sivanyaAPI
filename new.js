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
            res.status(200).json({ message: 'User logged in successfully', user: { id: user.user_id, is_admin: user.is_admin, user_type: user.user_type, name: user.name, email: user.email } });
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
        // Check if category already exists
        const existingCategory = await client.query('SELECT * FROM ProductCategories WHERE category_name = $1', [category_name]);
        if (existingCategory.rows.length > 0) {
            return res.status(409).json({ error: 'Category already exists' }); // HTTP 409 Conflict
        }

        // Insert new category
        const query = 'INSERT INTO ProductCategories (category_name) VALUES ($1) RETURNING *';
        const { rows } = await client.query(query, [category_name]);

        res.status(201).json({ message: 'Category created successfully', category: rows[0] });
    } catch (err) {
        console.error('❌ Error creating category:', err);
        res.status(500).json({ error: 'Error creating category' });
    }
});


app.get('/categories', async (req, res) => {
    try {
        const query = 'SELECT * FROM ProductCategories ORDER BY category_name ASC';
        const { rows } = await client.query(query);

        res.status(200).json({ categories: rows });
    } catch (err) {
        console.error('❌ Error fetching categories:', err);
        res.status(500).json({ error: 'Error fetching categories' });
    }
});


app.delete('/categories/:id', async (req, res) => {
    const { id } = req.params;

    // Ensure ID is a valid number
    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid category ID' });
    }

    try {
        const query = 'DELETE FROM ProductCategories WHERE category_id = $1 RETURNING *';
        const { rows } = await client.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.status(200).json({ message: 'Category deleted successfully' });
    } catch (err) {
        console.error('❌ Error deleting category:', err);
        res.status(500).json({ error: 'Error deleting category' });
    }
});


app.post('/api/products', async (req, res) => {
    const { name, category_id, description, sizes, prices } = req.body;

    try {
        // Insert product details
        const productResult = await client.query(
            'INSERT INTO public.Products (name, category_id, description) VALUES ($1, $2, $3) RETURNING product_id',
            [name, category_id, description]
        );
        const productId = productResult.rows[0].product_id;

        // Insert product stock
        for (const size of sizes) {
            await client.query(
                'INSERT INTO public.ProductStock (product_id, size, quantity,stock_type) VALUES ($1, $2, $3, $4)',
                [productId, size.size, size.quantity, 'IN']
            );
        }

        // Insert product pricing
        for (const price of prices) {
            await client.query(
                'INSERT INTO public.ProductPricing (product_id, size, user_type, price) VALUES ($1, $2, $3, $4)',
                [productId, price.size, price.user_type, price.price]
            );
        }

        res.status(201).json({ productId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/products/:productId/images', async (req, res) => {
    const { productId } = req.params;
    const files = req.files.images;

    try {
        for (const file of files) {
            const result = await cloudinary.uploader.upload(file.tempFilePath);
            await client.query(
                'INSERT INTO public.ProductImages (product_id, image_url) VALUES ($1, $2)',
                [productId, result.secure_url]
            );
        }

        res.status(201).json({ message: 'Images uploaded successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all products
app.get('/products', async (req, res) => {
    try {
        const query = `
            SELECT p.product_id, p.name, p.category_id, p.description, 
                COALESCE(json_agg(DISTINCT ps) FILTER (WHERE ps.size IS NOT NULL), '[]') AS stock,
                COALESCE(json_agg(DISTINCT pi) FILTER (WHERE pi.image_url IS NOT NULL), '[]') AS images
            FROM Products p
            LEFT JOIN ProductStock ps ON p.product_id = ps.product_id
            LEFT JOIN ProductImages pi ON p.product_id = pi.product_id
            GROUP BY p.product_id;
        `;
        const result = await client.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Get product by ID
app.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT p.product_id, p.name, p.category_id, p.description, 
                COALESCE(json_agg(DISTINCT ps) FILTER (WHERE ps.size IS NOT NULL), '[]') AS stock,
                COALESCE(json_agg(DISTINCT pi) FILTER (WHERE pi.image_url IS NOT NULL), '[]') AS images
            FROM Products p
            LEFT JOIN ProductStock ps ON p.product_id = ps.product_id
            LEFT JOIN ProductImages pi ON p.product_id = pi.product_id
            WHERE p.product_id = $1
            GROUP BY p.product_id;
        `;
        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Product not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post('/favorites', async (req, res) => {
    const { user_id, product_id } = req.body;

    if (!user_id || !product_id) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    try {
        const query = `
            INSERT INTO public.Favorites (user_id, product_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, product_id) 
            DO NOTHING;
        `;
        const result = await client.query(query, [user_id, product_id]);

        res.status(201).json({ message: "Added to favorites successfully", favorite: result.rows[0] });
    } catch (error) {
        console.error("Error adding to favorites:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


app.post('/cart', async (req, res) => {
    const { user_id, product_id, size, quantity } = req.body;

    if (!user_id || !product_id || !size || !quantity) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    try {
        const query = `
            INSERT INTO public.Cart (user_id, product_id, size, quantity)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, product_id, size)
            DO UPDATE SET quantity = Cart.quantity + EXCLUDED.quantity
            RETURNING *;
        `;
        const result = await client.query(query, [user_id, product_id, size, quantity]);

        res.status(201).json({ message: "Added to cart successfully", cart: result.rows[0] });
    } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.get('/favorites/:user_id', async (req, res) => {
    const { user_id } = req.params;

    if (!user_id) {
        return res.status(400).json({ message: "User ID is required" });
    }

    try {
        const query = `
            SELECT 
                f.favorite_id,  
                p.product_id,  
                p.name AS product_name,  
                COALESCE(json_agg(DISTINCT img.image_url) FILTER (WHERE img.image_url IS NOT NULL), '[]') AS images,
                pp.size,
                pp.price
            FROM public.Favorites f
            JOIN public.Products p ON f.product_id = p.product_id
            LEFT JOIN public.Users u ON f.user_id = u.user_id  -- Get user_type for price filtering
            LEFT JOIN public.ProductImages img ON p.product_id = img.product_id
            LEFT JOIN public.ProductPricing pp ON p.product_id = pp.product_id AND pp.user_type = u.user_type
            WHERE f.user_id = $1
            GROUP BY f.favorite_id, p.product_id, p.name, pp.size, pp.price
            ORDER BY f.favorite_id DESC;
        `;

        const result = await client.query(query, [user_id]);

        res.status(200).json({ favorites: result.rows });
    } catch (error) {
        console.error("Error fetching favorites:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// New Database sivanyaApk End

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
