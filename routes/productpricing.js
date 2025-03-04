const express = require('express');
const { Client } = require('pg'); // Import Client from pg
const router = express.Router();

const client = new Client({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});
client.connect();

// **Add or update pricing for a product**
router.post('/', async (req, res) => {
    const { product_id, size, user_type, price } = req.body;
    
    console.log("Received request:", req.body); // Debugging
    
    if (!product_id || !size || !user_type || !price) {
        return res.status(400).json({ message: "All fields (product_id, size, user_type, price) are required" });
    }

    try {
        const query = `
            INSERT INTO public.ProductPricing (product_id, size, user_type, price) 
            VALUES ($1, $2, $3, $4) 
            ON CONFLICT (product_id, size, user_type) 
            DO UPDATE SET price = EXCLUDED.price 
            RETURNING *;
        `;
        
        console.log("Running query:", query); // Debugging

        const result = await client.query(query, [product_id, size, user_type, price]);

        console.log("Query result:", result.rows); // Debugging
        
        res.status(201).json({ message: "Pricing added/updated successfully", pricing: result.rows[0] });
    } catch (error) {
        console.error("Error adding/updating pricing:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Get pricing details for a product**
router.get('/:product_id', async (req, res) => {
    const { product_id } = req.params;

    try {
        const query = `SELECT * FROM public.ProductPricing WHERE product_id = $1`;
        const result = await client.query(query, [product_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No pricing found for this product" });
        }

        res.status(200).json({ pricing: result.rows });

    } catch (error) {
        console.error("Error retrieving pricing:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Update product pricing**
router.put('/:price_id', async (req, res) => {
    const { price_id } = req.params;
    const { price } = req.body;

    if (price === undefined) {
        return res.status(400).json({ message: "Price is required" });
    }

    try {
        const query = `
            UPDATE public.ProductPricing SET price = $1 WHERE price_id = $2 RETURNING *;
        `;
        const result = await client.query(query, [price, price_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Pricing entry not found" });
        }

        res.status(200).json({ message: "Pricing updated", pricing: result.rows[0] });

    } catch (error) {
        console.error("Error updating pricing:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Remove pricing entry**
router.delete('/:price_id', async (req, res) => {
    const { price_id } = req.params;

    try {
        const query = `DELETE FROM public.ProductPricing WHERE price_id = $1 RETURNING *;`;
        const result = await client.query(query, [price_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Pricing entry not found" });
        }

        res.status(200).json({ message: "Pricing removed", deletedPricing: result.rows[0] });

    } catch (error) {
        console.error("Error deleting pricing:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;
