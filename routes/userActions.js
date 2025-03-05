const express = require('express');
const { Client } = require('pg');

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();

// **Add to Favorites**
router.post('/favorites', async (req, res) => {
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


// **Get User's Favorite Products**
router.get('/favorites/:user_id', async (req, res) => {
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

// **Remove from Favorites**
router.delete('/favorites/:favorite_id', async (req, res) => {
    const { favorite_id } = req.params;

    if (!favorite_id) {
        return res.status(400).json({ message: "Favorite ID is required" });
    }

    try {
        const result = await client.query(
            'DELETE FROM public.Favorites WHERE favorite_id = $1 RETURNING *',
            [favorite_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Favorite not found" });
        }

        res.status(200).json({ message: "Removed from favorites successfully" });
    } catch (error) {
        console.error("Error removing from favorites:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});



// **Add to Cart**
router.post('/cart', async (req, res) => {
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

// **Get User's Cart**
router.get('/cart/:user_id', async (req, res) => {
    const { user_id } = req.params;

    if (!user_id) {
        return res.status(400).json({ message: "User ID is required" });
    }

    try {
        const query = `
                SELECT c.cart_id, c.product_id, c.size, c.quantity, p.name AS product_name,
                    COALESCE(json_agg(DISTINCT img.image_url) FILTER (WHERE img.image_url IS NOT NULL), '[]') AS images,
                    pp.price
                FROM public.Cart c
                JOIN public.Products p ON c.product_id = p.product_id
                LEFT JOIN public.ProductImages img ON p.product_id = img.product_id
                LEFT JOIN public.ProductPricing pp ON c.product_id = pp.product_id AND pp.size = c.size
                LEFT JOIN public.Users utb ON utb.user_id = c.user_id
                WHERE c.user_id = 4 AND utb.user_type = pp.user_type
                GROUP BY c.cart_id, c.product_id, c.size, c.quantity, p.name, pp.price
                ORDER BY c.cart_id DESC;
        `;

        const result = await client.query(query, [user_id]);

        res.status(200).json({ cart: result.rows });
    } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// **Update Cart Item Quantity (With Stock Validation)**
router.put('/cart/:cart_id', async (req, res) => {
    const { cart_id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity <= 0) {
        return res.status(400).json({ message: "Quantity must be greater than zero" });
    }

    try {
        // **Get Product ID & Size from Cart**
        const cartItemQuery = 'SELECT product_id, size FROM public.Cart WHERE cart_id = $1';
        const cartItemResult = await client.query(cartItemQuery, [cart_id]);

        if (cartItemResult.rows.length === 0) {
            return res.status(404).json({ message: "Cart item not found" });
        }

        const { product_id, size } = cartItemResult.rows[0];

        // **Check Available Stock for the Product & Size**
        const stockQuery = 'SELECT quantity FROM public.ProductStock WHERE product_id = $1 AND size = $2';
        const stockResult = await client.query(stockQuery, [product_id, size]);

        if (stockResult.rows.length === 0) {
            return res.status(404).json({ message: "Stock information not found for this product & size" });
        }

        const availableStock = stockResult.rows[0].quantity;

        // **Validate Requested Quantity Against Stock**
        if (quantity > availableStock) {
            return res.status(400).json({ message: `Only ${availableStock} items are available in stock` });
        }

        // **Update the Cart Item Quantity**
        const updateCartQuery = 'UPDATE public.Cart SET quantity = $1 WHERE cart_id = $2 RETURNING *';
        const updateCartResult = await client.query(updateCartQuery, [quantity, cart_id]);

        res.status(200).json({ message: "Cart updated successfully", cart: updateCartResult.rows[0] });
    } catch (error) {
        console.error("❌ Error updating cart:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// **Remove Item from Cart**
router.delete('/cart/:cart_id', async (req, res) => {
    const { cart_id } = req.params;

    if (!cart_id) {
        return res.status(400).json({ message: "Cart ID is required" });
    }

    try {
        const result = await client.query(
            'DELETE FROM public.Cart WHERE cart_id = $1 RETURNING *',
            [cart_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Cart item not found" });
        }

        res.status(200).json({ message: "Item removed from cart successfully" });
    } catch (error) {
        console.error("Error removing from cart:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


module.exports = router;
