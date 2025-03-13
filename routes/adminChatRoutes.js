
const express = require('express');
const { Client } = require('pg');

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();

// **Admin: Get All Chat Conversations**
router.get('/conversations', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT u.user_id, u.name, u.email 
            FROM public.Users u
            JOIN public.SupportChat sc 
            ON u.user_id = sc.sender_id OR u.user_id = sc.receiver_id;
        `;
        const result = await client.query(query);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No conversations found" });
        }

        res.status(200).json({ conversations: result.rows });

    } catch (error) {
        console.error("Error retrieving all conversations:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Admin: Get Messages Between Two Users**
router.get('/:user1_id/:user2_id', async (req, res) => {
    const user1_id = parseInt(req.params.user1_id, 10);
    const user2_id = parseInt(req.params.user2_id, 10);

    if (isNaN(user1_id) || isNaN(user2_id)) {
        return res.status(400).json({ message: "Invalid user IDs" });
    }

    try {
        const query = `
            SELECT sc.*, ms.status, ms.updated_at 
            FROM public.SupportChat sc
            LEFT JOIN LATERAL (
                SELECT status, updated_at
                FROM public.MessageStatus ms
                WHERE ms.chat_id = sc.chat_id
                ORDER BY ms.updated_at DESC
                LIMIT 1
            ) ms ON true
            WHERE (sc.sender_id = $1 AND sc.receiver_id = $2) OR 
                  (sc.sender_id = $2 AND sc.receiver_id = $1)
            ORDER BY sc.sent_at ASC;
        `;

        const result = await client.query(query, [user1_id, user2_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No messages found" });
        }

        res.status(200).json({ chats: result.rows });

    } catch (error) {
        console.error("Error retrieving chat messages:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;
