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

// PostgreSQL Connection
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
client.connect();

// Middleware
app.use(bodyParser.json());
app.use(fileUpload({ useTempFiles: true }));

// Routes
const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const userActionsRoutes = require('./routes/userActions');
const ordersRoutes = require('./routes/orders');
const paymentsRoutes = require('./routes/payments');
const supportRoutes = require('./routes/support');
const productstockRoutes = require('./routes/productstock');
const productpricingRoutes = require('./routes/productpricing');
const pricingRoutes = require('./routes/pricing');
const adminChatRoutes = require('./routes/adminChatRoutes'); // Admin chat


app.use('/auth', authRoutes);
app.use('/categories', categoryRoutes);
app.use('/products', productRoutes);
app.use('/user-actions', userActionsRoutes);
app.use('/orders', ordersRoutes);
app.use('/payments', paymentsRoutes);
app.use('/support', supportRoutes);
app.use('/product-stock', productstockRoutes);
app.use('/productpricing', productpricingRoutes);
app.use('/pricing', pricingRoutes);
app.use('/admin/chat', adminChatRoutes); // Admin chat

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
