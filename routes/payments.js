const express = require('express');
const { Client } = require('pg');

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();

// **Process Payment**
router.post('/payments', async (req, res) => {
    const { order_id, user_id, amount, payment_method, payment_reference } = req.body;

    if (!order_id || !user_id || !amount || !payment_method || !payment_reference) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        // **Check if Order Exists and Payment is Allowed**
        const orderCheckQuery = 'SELECT * FROM public.Orders WHERE order_id = $1 AND user_id = $2';
        const orderCheckResult = await client.query(orderCheckQuery, [order_id, user_id]);

        if (orderCheckResult.rows.length === 0) {
            return res.status(404).json({ message: "Order not found or does not belong to the user" });
        }

        if (orderCheckResult.rows[0].payment_status === 'Completed') {
            return res.status(400).json({ message: "Payment already completed for this order" });
        }

        // **Insert Payment Record**
        const paymentQuery = `
            INSERT INTO public.Payments (order_id, user_id, amount, payment_method, payment_reference, status)
            VALUES ($1, $2, $3, $4, $5, 'Pending') RETURNING *;
        `;
        const paymentResult = await client.query(paymentQuery, [order_id, user_id, amount, payment_method, payment_reference]);

        res.status(201).json({ message: "Payment initiated", payment: paymentResult.rows[0] });

    } catch (error) {
        console.error("Error processing payment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Get Payment Details for an Order**
router.get('/payments/:order_id', async (req, res) => {
    const { order_id } = req.params;

    try {
        const query = `
            SELECT * FROM public.Payments WHERE order_id = $1;
        `;
        const result = await client.query(query, [order_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No payment found for this order" });
        }

        res.status(200).json({ payment: result.rows });

    } catch (error) {
        console.error("Error fetching payment details:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Get All Payments for a User**
router.get('/payments/user/:user_id', async (req, res) => {
    const { user_id } = req.params;

    try {
        const query = `
            SELECT * FROM public.Payments WHERE user_id = $1 ORDER BY payment_date DESC;
        `;
        const result = await client.query(query, [user_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No payments found for this user" });
        }

        res.status(200).json({ payments: result.rows });

    } catch (error) {
        console.error("Error fetching user payments:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Update Payment Status**
router.put('/payments/:payment_id', async (req, res) => {
    const { payment_id } = req.params;
    const { status } = req.body;

    if (!['Pending', 'Completed', 'Failed'].includes(status)) {
        return res.status(400).json({ message: "Invalid payment status" });
    }

    try {
        // **Update Payment Status**
        const query = `
            UPDATE public.Payments SET status = $1 WHERE payment_id = $2 RETURNING *;
        `;
        const result = await client.query(query, [status, payment_id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Payment not found" });
        }

        // **Update Order Payment Status if Payment is Completed**
        if (status === 'Completed') {
            await client.query(`
                UPDATE public.Orders SET payment_status = 'Completed' WHERE order_id = (
                    SELECT order_id FROM public.Payments WHERE payment_id = $1
                );
            `, [payment_id]);
        }

        res.status(200).json({ message: "Payment status updated", payment: result.rows[0] });

    } catch (error) {
        console.error("Error updating payment status:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Delete a Payment Record**
router.delete('/payments/:payment_id', async (req, res) => {
    const { payment_id } = req.params;

    try {
        // **Check if Payment Exists**
        const checkQuery = 'SELECT * FROM public.Payments WHERE payment_id = $1';
        const checkResult = await client.query(checkQuery, [payment_id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: "Payment not found" });
        }

        // **Delete Payment**
        const query = 'DELETE FROM public.Payments WHERE payment_id = $1 RETURNING *';
        const result = await client.query(query, [payment_id]);

        res.status(200).json({ message: "Payment deleted successfully", payment: result.rows[0] });

    } catch (error) {
        console.error("Error deleting payment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;
