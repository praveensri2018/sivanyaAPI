const express = require('express');
const { Client } = require('pg');

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();

// **Send a Message & Track Status**
router.post('/chat', async (req, res) => {
    const { sender_id, receiver_id, message } = req.body;

    if (!sender_id || !receiver_id || !message.trim()) {
        return res.status(400).json({ message: "Sender, receiver, and message are required" });
    }

    try {
        // **Insert the Message into SupportChat**
        const chatQuery = `
            INSERT INTO public.SupportChat (sender_id, receiver_id, message) 
            VALUES ($1, $2, $3) RETURNING *;
        `;
        const chatResult = await client.query(chatQuery, [sender_id, receiver_id, message]);
        const chat_id = chatResult.rows[0].chat_id;

        // **Insert Initial Status ("sent") into MessageStatus**
        const statusQuery = `
            INSERT INTO public.MessageStatus (chat_id, status) 
            VALUES ($1, 'sent') RETURNING *;
        `;
        await client.query(statusQuery, [chat_id]);

        res.status(201).json({ message: "Message sent", chat: chatResult.rows[0] });

    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Get Chat Messages with Latest Status**
router.get('/chat/:user_id', async (req, res) => {
    const { user_id } = req.params;

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
            WHERE sc.sender_id = $1 OR sc.receiver_id = $1 
            ORDER BY sc.sent_at ASC;
        `;
        const result = await client.query(query, [user_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No messages found for this user" });
        }

        res.status(200).json({ chats: result.rows });

    } catch (error) {
        console.error("Error retrieving messages:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// **Update Message Status (delivered/read)**
router.post('/chat/status', async (req, res) => {
    const { chat_id, status } = req.body;

    if (!chat_id || !['delivered', 'read'].includes(status)) {
        return res.status(400).json({ message: "Invalid chat_id or status" });
    }

    try {
        const query = `
            INSERT INTO public.MessageStatus (chat_id, status) 
            VALUES ($1, $2) RETURNING *;
        `;
        const result = await client.query(query, [chat_id, status]);

        res.status(200).json({ message: `Message marked as ${status}`, status: result.rows[0] });

    } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Get Message Status History**
router.get('/chat/status/:chat_id', async (req, res) => {
    const { chat_id } = req.params;

    try {
        const query = `
            SELECT * FROM public.MessageStatus 
            WHERE chat_id = $1 ORDER BY updated_at ASC;
        `;
        const result = await client.query(query, [chat_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No status history found for this message" });
        }

        res.status(200).json({ status_history: result.rows });

    } catch (error) {
        console.error("Error retrieving status history:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Get Chat Conversations (List of Users Chatting with the Given User)**
router.get('/chat/conversations/:user_id', async (req, res) => {
    const { user_id } = req.params;

    try {
        const query = `
            SELECT DISTINCT u.user_id, u.name, u.email 
            FROM public.Users u 
            JOIN public.SupportChat sc 
            ON u.user_id = sc.sender_id OR u.user_id = sc.receiver_id
            WHERE u.user_id != $1 AND (sc.sender_id = $1 OR sc.receiver_id = $1);
        `;
        const result = await client.query(query, [user_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No conversations found for this user" });
        }

        res.status(200).json({ conversations: result.rows });

    } catch (error) {
        console.error("Error retrieving conversations:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Delete a Chat Message**
router.delete('/chat/:chat_id', async (req, res) => {
    const { chat_id } = req.params;

    try {
        // **Check if the Message Exists**
        const checkQuery = 'SELECT * FROM public.SupportChat WHERE chat_id = $1';
        const checkResult = await client.query(checkQuery, [chat_id]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: "Chat message not found" });
        }

        // **Delete the Message**
        const deleteQuery = 'DELETE FROM public.SupportChat WHERE chat_id = $1 RETURNING *';
        const result = await client.query(deleteQuery, [chat_id]);

        res.status(200).json({ message: "Chat message deleted", deletedChat: result.rows[0] });

    } catch (error) {
        console.error("Error deleting chat message:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// **Admin: Get All Chat Conversations**
router.get('/admin/chat/conversations', async (req, res) => {
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
router.get('/admin/chat/:user1_id/:user2_id', async (req, res) => {
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
