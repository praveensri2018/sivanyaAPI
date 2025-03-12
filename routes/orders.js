const express = require('express');
const { Client } = require('pg');

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();

// **Place an Order**
router.post('/', async (req, res) => {
    const { user_id, shipping_address, payment_method, payment_reference } = req.body;  
   
    if (!user_id) {
        return res.status(400).json({ message: "User ID is required" });
    }

    if (!shipping_address || typeof shipping_address !== 'object') {
        return res.status(400).json({ message: "Valid shipping address is required" });
    }

    if (!payment_method || !payment_reference) {
        return res.status(400).json({ message: "Payment method and reference are required" });
    }

    try {
        console.log("Fetching amount from Card table...");
        const cardAmountQuery = `SELECT amount FROM public.Card WHERE user_id = $1`;
        const cardAmountResult = await client.query(cardAmountQuery, [user_id]);

        if (cardAmountResult.rows.length === 0) {
            console.log("No amount found in Card table for user_id:", user_id);
            return res.status(400).json({ message: "No amount found in Card table for this user" });
        }

        const totalAmount = parseFloat(cardAmountResult.rows[0].amount); // Fetch INR amount
        console.log("Amount from Card table:", totalAmount);

        console.log("Fetching cart items...");
        const cartQuery = `
            SELECT c.product_id, c.size, c.quantity, pp.price
            FROM public.Cart c
            JOIN public.ProductPricing pp 
            ON c.product_id = pp.product_id AND c.size = pp.size
            WHERE c.user_id = $1 AND pp.user_type = (SELECT user_type FROM public.Users WHERE user_id = $1);
        `;
        const cartResult = await client.query(cartQuery, [user_id]);

        if (cartResult.rows.length === 0) {
            console.log("Cart is empty for user_id:", user_id);
            return res.status(400).json({ message: "Cart is empty" });
        }

        const calculatedAmount = cartResult.rows.reduce((sum, item) => sum + (item.quantity * item.price), 0);
        console.log("Calculated Cart Total:", calculatedAmount);

        if (calculatedAmount !== totalAmount) {
            console.log("Mismatch: Cart total =", calculatedAmount, "but Card amount =", totalAmount);
            return res.status(400).json({ message: "Payment amount does not match order total" });
        }

        console.log("Creating order...");
        const orderQuery = `
            INSERT INTO public.Orders (user_id, total_amount, shipping_address) 
            VALUES ($1, $2, $3) RETURNING *;
        `;
        const orderResult = await client.query(orderQuery, [user_id, totalAmount, shipping_address]);
        const order_id = orderResult.rows[0].order_id;
        console.log("Order created with ID:", order_id);

        console.log("Inserting payment record...");
        const paymentQuery = `
            INSERT INTO public.Payments (order_id, user_id, amount, payment_method, payment_reference, status)
            VALUES ($1, $2, $3, $4, $5, 'Completed') RETURNING *;
        `;
        await client.query(paymentQuery, [order_id, user_id, totalAmount, payment_method, payment_reference]);

        console.log("Inserting order details...");
        const orderDetailsQuery = `
            INSERT INTO public.OrderDetails (order_id, product_id, size, quantity, price)
            VALUES ${cartResult.rows.map((_, i) => `($1, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5})`).join(", ")}
        `;
        const orderDetailsValues = [order_id, ...cartResult.rows.flatMap(item => [item.product_id, item.size, item.quantity, item.price])];
        console.log("Order Details Values:", orderDetailsValues);
        await client.query(orderDetailsQuery, orderDetailsValues);

        console.log("Updating stock...");
        const stockQuery = `
            INSERT INTO public.ProductStock (product_id, size, quantity, stock_type)
            VALUES ${cartResult.rows.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, 'OUT')`).join(", ")}
        `;
        const stockValues = cartResult.rows.flatMap(item => [item.product_id, item.size, item.quantity]);
        console.log("Stock Values:", stockValues);
        await client.query(stockQuery, stockValues);

        console.log("Clearing user cart...");
        await client.query('DELETE FROM public.Cart WHERE user_id = $1', [user_id]);

        res.status(201).json({ message: "Order placed successfully", order: orderResult.rows[0] });

    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ message: "Internal server error", error: error.message });
    }
});



/*
router.post('/', async (req, res) => {
    const { user_id, shipping_address } = req.body;  // Get shipping address from request body

    if (!user_id) {
        return res.status(400).json({ message: "User ID is required" });
    }

    if (!shipping_address || typeof shipping_address !== 'object') {
        return res.status(400).json({ message: "Valid shipping address is required" });
    }

    try {
        // **Retrieve Cart Items**
        const cartQuery = `
            SELECT c.product_id, c.size, c.quantity, pp.price
            FROM public.Cart c
            JOIN public.ProductPricing pp 
            ON c.product_id = pp.product_id AND c.size = pp.size
            WHERE c.user_id = $1 AND pp.user_type = (SELECT user_type FROM public.Users WHERE user_id = $1);
        `;
        const cartResult = await client.query(cartQuery, [user_id]);

        if (cartResult.rows.length === 0) {
            return res.status(400).json({ message: "Cart is empty" });
        }

        // **Calculate Total Amount**
        const totalAmount = cartResult.rows.reduce((sum, item) => sum + (item.quantity * item.price), 0);

        // **Create Order with Shipping Address**
        const orderQuery = `
            INSERT INTO public.Orders (user_id, total_amount, shipping_address) 
            VALUES ($1, $2, $3) RETURNING *;
        `;
        const orderResult = await client.query(orderQuery, [user_id, totalAmount, shipping_address]);
        const order_id = orderResult.rows[0].order_id;

        // **Insert Order Details**
        const orderDetailsQuery = `
            INSERT INTO public.OrderDetails (order_id, product_id, size, quantity, price)
            VALUES ${cartResult.rows.map((_, i) => `($1, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5})`).join(", ")}
        `;
        const orderDetailsValues = [order_id, ...cartResult.rows.flatMap(item => [item.product_id, item.size, item.quantity, item.price])];
        await client.query(orderDetailsQuery, orderDetailsValues);

        // **Insert Stock as 'OUT'**
        const stockQuery = `
            INSERT INTO public.ProductStock (product_id, size, quantity, stock_type)
            VALUES ${cartResult.rows.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, 'OUT')`).join(", ")}
        `;
        const stockValues = cartResult.rows.flatMap(item => [item.product_id, item.size, item.quantity]);
        await client.query(stockQuery, stockValues);

        // **Clear User's Cart**
        await client.query('DELETE FROM public.Cart WHERE user_id = $1', [user_id]);

        res.status(201).json({ message: "Order placed successfully", order: orderResult.rows[0] });

    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});
*/
router.get('/all', async (req, res) => {
    try {
        const query = 'SELECT order_id, total_amount, order_status, payment_status, created_at, shipping_address FROM public.Orders ORDER BY created_at DESC';
        const { rows } = await client.query(query);

        res.status(200).json({ orders: rows });
    } catch (err) {
        console.error('❌ Error fetching categories:', err);
        res.status(500).json({ error: 'Error fetching categories' });
    }
});


// **Get User's Orders**
router.get('/:user_id', async (req, res) => {
    const { user_id } = req.params;

    try {
        const query = `
            SELECT order_id, total_amount, order_status, payment_status, created_at, shipping_address
            FROM public.Orders
            WHERE user_id = $1
            ORDER BY created_at DESC;
        `;
        const result = await client.query(query, [user_id]);
        res.status(200).json({ orders: result.rows });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// **Get Order Details**
router.get('/details/:order_id', async (req, res) => {
    const { order_id } = req.params;

    try {
        const query = `
            SELECT 
                od.order_id, od.product_id, p.name AS product_name, od.size, 
                od.quantity, od.price, (od.quantity * od.price) AS total_price,
                o.shipping_address
            FROM public.OrderDetails od
            JOIN public.Products p ON od.product_id = p.product_id
            JOIN public.Orders o ON od.order_id = o.order_id
            WHERE od.order_id = $1;
        `;
        const result = await client.query(query, [order_id]);
        res.status(200).json({ order_details: result.rows });
    } catch (error) {
        console.error("Error fetching order details:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// **Update Order Status**
router.put('/:order_id', async (req, res) => {
    const { order_id } = req.params;
    const { order_status } = req.body;

    if (!['Pending', 'Shipped', 'Delivered', 'Cancelled'].includes(order_status)) {
        return res.status(400).json({ message: "Invalid order status" });
    }

    try {
        const query = `
            UPDATE public.Orders SET order_status = $1 WHERE order_id = $2 RETURNING *;
        `;
        const result = await client.query(query, [order_status, order_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Order not found" });
        }

        res.status(200).json({ message: "Order updated successfully", order: result.rows[0] });
    } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Cancel Order (Update Order Status to "Cancelled")**
router.delete('/:order_id', async (req, res) => {
    const { order_id } = req.params;

    try {
        // **Check if Order Exists and is Cancellable**
        const checkQuery = 'SELECT order_status FROM public.Orders WHERE order_id = $1';
        const checkResult = await client.query(checkQuery, [order_id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: "Order not found" });
        }

        if (checkResult.rows[0].order_status !== 'Pending') {
            return res.status(400).json({ message: "Only pending orders can be cancelled" });
        }

        // **Update Order Status to "Cancelled"**
        const updateQuery = `UPDATE public.Orders SET order_status = 'Cancelled' WHERE order_id = $1 RETURNING *;`;
        const result = await client.query(updateQuery, [order_id]);

        res.status(200).json({ message: "Order cancelled successfully", order: result.rows[0] });

    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;
