const express = require('express');
const { Client } = require('pg');

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();

// **Add stock for a product**
router.post('/product-stock', async (req, res) => {
    const { product_id, size, quantity, stock_type } = req.body;

    if (!product_id || !size || !quantity || !stock_type) {
        return res.status(400).json({ message: "All fields (product_id, size, quantity, stock_type) are required" });
    }

    try {
        const query = `
            INSERT INTO public.ProductStock (product_id, size, quantity, stock_type)
            VALUES ($1, $2, $3, $4) RETURNING *;
        `;
        const result = await client.query(query, [product_id, size, quantity, stock_type]);

        res.status(201).json({ message: "Stock added successfully", stock: result.rows[0] });

    } catch (error) {
        console.error("Error adding stock:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Get stock details for a product**
router.get('/product-stock/:product_id', async (req, res) => {
    const { product_id } = req.params;

    try {
        const query = `SELECT * FROM public.ProductStock WHERE product_id = $1`;
        const result = await client.query(query, [product_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No stock found for this product" });
        }

        res.status(200).json({ stock: result.rows });

    } catch (error) {
        console.error("Error retrieving stock:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Update stock quantity**
router.put('/product-stock/:stock_id', async (req, res) => {
    const { stock_id } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined) {
        return res.status(400).json({ message: "Quantity is required" });
    }

    try {
        const query = `
            UPDATE public.ProductStock SET quantity = $1 WHERE stock_id = $2 RETURNING *;
        `;
        const result = await client.query(query, [quantity, stock_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Stock entry not found" });
        }

        res.status(200).json({ message: "Stock updated", stock: result.rows[0] });

    } catch (error) {
        console.error("Error updating stock:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Remove stock entry**
router.delete('/product-stock/:stock_id', async (req, res) => {
    const { stock_id } = req.params;

    try {
        const query = `DELETE FROM public.ProductStock WHERE stock_id = $1 RETURNING *;`;
        const result = await client.query(query, [stock_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Stock entry not found" });
        }

        res.status(200).json({ message: "Stock removed", deletedStock: result.rows[0] });

    } catch (error) {
        console.error("Error deleting stock:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;
