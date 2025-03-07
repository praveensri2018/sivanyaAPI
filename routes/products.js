const express = require('express');
const { Client } = require('pg');
const cloudinary = require('cloudinary').v2;

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();

// **Add a new product**
router.post('/', async (req, res) => {
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
                'INSERT INTO public.ProductStock (product_id, size, quantity, stock_type) VALUES ($1, $2, $3, $4)',
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

// **Upload product images**
router.post('/:productId/images', async (req, res) => {
    const { productId } = req.params;

    // Validate request
    if (!req.files || !req.files.images) {
        return res.status(400).json({ error: 'No images uploaded' });
    }

    let files = req.files.images;

    // If only one file is uploaded, make it an array
    if (!Array.isArray(files)) {
        files = [files]; 
    }

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
        console.error('❌ Error uploading images:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// **Get all products**
router.get('/all', async (req, res) => {
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

// **Get product by ID**
router.get('/:id', async (req, res) => {
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

// **Delete product by ID**
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid product ID' });
    }

    try {
        // Check if product exists
        const productExists = await client.query('SELECT * FROM public.Products WHERE product_id = $1', [id]);
        if (productExists.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // **Delete related data before deleting the product**
        await client.query('DELETE FROM public.Cart WHERE product_id = $1', [id]);
        await client.query('DELETE FROM public.Favorites WHERE product_id = $1', [id]);
        await client.query('DELETE FROM public.OrderDetails WHERE product_id = $1', [id]);
        await client.query('DELETE FROM public.ProductImages WHERE product_id = $1', [id]);
        await client.query('DELETE FROM public.ProductStock WHERE product_id = $1', [id]);
        await client.query('DELETE FROM public.ProductPricing WHERE product_id = $1', [id]);

        // **Delete product**
        const deleteProductQuery = 'DELETE FROM public.Products WHERE product_id = $1 RETURNING *';
        const { rows } = await client.query(deleteProductQuery, [id]);

        res.status(200).json({ message: 'Product deleted successfully', product: rows[0] });
    } catch (error) {
        console.error('❌ Error deleting product:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// **Get products with pagination (Lazy Loading)**
router.get('/', async (req, res) => {
    let { page = 1, limit = 10, search = '', category_id, size, user_type, sortBy = 'created_at', order = 'desc' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;
    
    const validSortColumns = ['name', 'created_at', 'price'];
    if (!validSortColumns.includes(sortBy)) sortBy = 'created_at';
    if (!['asc', 'desc'].includes(order.toLowerCase())) order = 'desc';

    try {
        let query = `
            SELECT p.product_id, p.name, p.category_id, p.description, 
                (SELECT json_agg(pi.image_url) FROM public.ProductImages pi WHERE pi.product_id = p.product_id) AS images,
                (SELECT json_agg(json_build_object('size', ps.size, 'quantity', ps.quantity)) 
                 FROM public.ProductStock ps WHERE ps.product_id = p.product_id) AS stock,
                (SELECT price FROM public.ProductPricing pp WHERE pp.product_id = p.product_id 
                 AND ($3::TEXT IS NULL OR pp.user_type = $3) 
                 AND ($4::TEXT IS NULL OR pp.size = $4)
                 ORDER BY pp.price ${order} LIMIT 1) AS price
            FROM public.Products p
            WHERE ($1::TEXT IS NULL OR LOWER(p.name) LIKE LOWER($1) OR LOWER(p.description) LIKE LOWER($1))
                AND ($2::INT IS NULL OR p.category_id = $2)
            ORDER BY ${sortBy} ${order}
            LIMIT $5 OFFSET $6;
        `;

        const productsResult = await client.query(query, [search ? `%${search}%` : null, category_id || null, user_type || null, size || null, limit, offset]);

        // Get total product count
        const countQuery = `
            SELECT COUNT(*) FROM public.Products 
            WHERE ($1::TEXT IS NULL OR LOWER(name) LIKE LOWER($1) OR LOWER(description) LIKE LOWER($1))
                AND ($2::INT IS NULL OR category_id = $2);
        `;
        const countResult = await client.query(countQuery, [search ? `%${search}%` : null, category_id || null]);
        const totalProducts = parseInt(countResult.rows[0].count);

        res.json({
            totalProducts,
            totalPages: Math.ceil(totalProducts / limit),
            currentPage: page,
            products: productsResult.rows
        });
    } catch (error) {
        console.error("❌ Error fetching products:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post('/admin/products/:id/stock', async (req, res) => {
    try {
        const { id } = req.params;
        const { stockEntries } = req.body;

        if (!Array.isArray(stockEntries) || stockEntries.length === 0) {
            return res.status(400).json({ error: "Invalid stock data" });
        }

        for (let entry of stockEntries) {
            const { size, quantity, stock_type, retailer_price, customer_price } = entry;

            // Insert or Update Stock
            await client.query(`
                INSERT INTO public.ProductStock (product_id, size, quantity, stock_type)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (product_id, size) 
                DO UPDATE SET quantity = EXCLUDED.quantity, stock_type = EXCLUDED.stock_type;
            `, [id, size, quantity, stock_type]);

            // Insert or Update Retailer Price
            await client.query(`
                INSERT INTO public.ProductPricing (product_id, size, user_type, price)
                VALUES ($1, $2, 'Retailer', $3)
                ON CONFLICT (product_id, size, user_type) 
                DO UPDATE SET price = EXCLUDED.price;
            `, [id, size, retailer_price]);

            // Insert or Update Customer Price
            await client.query(`
                INSERT INTO public.ProductPricing (product_id, size, user_type, price)
                VALUES ($1, $2, 'Customer', $3)
                ON CONFLICT (product_id, size, user_type) 
                DO UPDATE SET price = EXCLUDED.price;
            `, [id, size, customer_price]);
        }

        res.json({ message: "Stock and pricing added successfully" });
    } catch (error) {
        console.error("❌ Error adding stock & pricing:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/admin/products', async (req, res) => {
    let { page = 1, limit = 10, search = '', category_id, sortBy = 'created_at', order = 'desc' } = req.query;
    
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const validSortColumns = ['name', 'created_at'];
    if (!validSortColumns.includes(sortBy)) sortBy = 'created_at';
    if (!['asc', 'desc'].includes(order.toLowerCase())) order = 'desc';

    try {
        const query = `
            SELECT p.product_id, p.name, p.category_id, p.description,
                COALESCE(json_agg(DISTINCT pi.image_url) FILTER (WHERE pi.image_url IS NOT NULL), '[]') AS images,
                COALESCE(json_agg(DISTINCT jsonb_build_object(
                    'size', ps.size,
                    'quantity', ps.quantity,
                    'stock_type', ps.stock_type
                )::jsonb) FILTER (WHERE ps.size IS NOT NULL), '[]')::json AS stock
            FROM public.Products p
            LEFT JOIN public.ProductImages pi ON p.product_id = pi.product_id
            LEFT JOIN public.ProductStock ps ON p.product_id = ps.product_id
            WHERE ($1::TEXT IS NULL OR LOWER(p.name) LIKE LOWER($1) OR LOWER(p.description) LIKE LOWER($1))
                AND ($2::INT IS NULL OR p.category_id = $2)
            GROUP BY p.product_id
            ORDER BY ${sortBy} ${order}
            LIMIT $3 OFFSET $4;
        `;

        const productsResult = await client.query(query, [
            search ? `%${search}%` : null, 
            category_id || null, 
            limit, 
            offset
        ]);

        // Get total product count
        const countQuery = `
            SELECT COUNT(*) FROM public.Products 
            WHERE ($1::TEXT IS NULL OR LOWER(name) LIKE LOWER($1) OR LOWER(description) LIKE LOWER($1))
                AND ($2::INT IS NULL OR category_id = $2);
        `;
        const countResult = await client.query(countQuery, [
            search ? `%${search}%` : null, 
            category_id || null
        ]);

        const totalProducts = parseInt(countResult.rows[0].count);

        res.json({
            totalProducts,
            totalPages: Math.ceil(totalProducts / limit),
            currentPage: page,
            products: productsResult.rows
        });
    } catch (error) {
        console.error("❌ Error fetching admin products:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 🔹 GET Single Product By ID (With Images, Stock, and Pricing)
router.get('/admin/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT p.product_id, p.name, p.category_id, p.description,
                COALESCE(json_agg(DISTINCT pi.image_url) FILTER (WHERE pi.image_url IS NOT NULL), '[]') AS images,
                COALESCE(json_agg(DISTINCT jsonb_build_object(
                    'size', ps.size,
                    'quantity', ps.quantity,
                    'stock_type', ps.stock_type
                )::jsonb) FILTER (WHERE ps.size IS NOT NULL), '[]')::json AS stock,
                COALESCE(json_agg(DISTINCT jsonb_build_object(
                    'size', pp.size,
                    'user_type', pp.user_type,
                    'price', pp.price
                )::jsonb) FILTER (WHERE pp.size IS NOT NULL), '[]')::json AS pricing
            FROM public.Products p
            LEFT JOIN public.ProductImages pi ON p.product_id = pi.product_id
            LEFT JOIN public.ProductStock ps ON p.product_id = ps.product_id
            LEFT JOIN public.ProductPricing pp ON p.product_id = pp.product_id
            WHERE p.product_id = $1
            GROUP BY p.product_id;
        `;

        const result = await client.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Product not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("❌ Error fetching admin product details:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
