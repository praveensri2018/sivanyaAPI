const express = require('express');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();

// **User Login**
router.post('/login', async (req, res) => {
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
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            res.status(200).json({
                message: 'User logged in successfully',
                user: {
                    id: user.user_id,
                    is_admin: user.is_admin,
                    user_type: user.user_type,
                    name: user.name,
                    email: user.email,
                },
            });
        } else {
            res.status(400).json({ error: 'Invalid password' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error processing login' });
    }
});

// **User Registration**
router.post('/register', async (req, res) => {
    const { name, email, password, phone, address, user_type } = req.body;

    if (!name || !email || !password || !user_type) {
        return res.status(400).json({ error: 'Name, email, password, and user type are required' });
    }

    try {
        const existingUser = await client.query('SELECT * FROM public.Users WHERE email = $1', [email]);

        const existingUserPhone = await client.query('SELECT * FROM public.Users WHERE phone = $1', [phone]);

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        if (existingUserPhone.rows.length > 0) {
            return res.status(400).json({ error: 'Phone already exists' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

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

router.get('/user/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'SELECT user_id, name, email, phone, address, user_type, is_admin FROM public.Users WHERE user_id = $1';
        const { rows } = await client.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.put('/user/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address } = req.body;

    try {
        const query = `
            UPDATE public.Users
            SET name = $1, email = $2, phone = $3, address = $4
            WHERE user_id = $5
            RETURNING user_id, name, email, phone, address;
        `;
        const values = [name, email, phone, address, id];

        const { rows } = await client.query(query, values);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({ message: 'User updated successfully', user: rows[0] });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/user/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'DELETE FROM public.Users WHERE user_id = $1 RETURNING user_id';
        const { rows } = await client.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.put('/change-password', async (req, res) => {
    const { user_id, old_password, new_password } = req.body;

    if (!user_id || !old_password || !new_password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const userQuery = 'SELECT password_hash FROM public.Users WHERE user_id = $1';
        const userResult = await client.query(userQuery, [user_id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isMatch = await bcrypt.compare(old_password, userResult.rows[0].password_hash);

        if (!isMatch) {
            return res.status(400).json({ error: 'Old password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        const updateQuery = 'UPDATE public.Users SET password_hash = $1 WHERE user_id = $2';
        await client.query(updateQuery, [hashedPassword, user_id]);

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/forgot-password', async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: 'Phone is required' });
    }

    try {
        const userQuery = 'SELECT user_id FROM public.Users WHERE phone = $1';
        const { rows } = await client.query(userQuery, [phone]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate a reset token (for simplicity, using user_id here)
        const resetToken = `reset-${rows[0].user_id}`;

        // Normally, you'd send this token via email
        res.status(200).json({ message: 'Password reset link sent', token: resetToken });
    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


module.exports = router;
