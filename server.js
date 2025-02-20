const express = require("express");
const { Client } = require("pg");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors"); // Allows frontend access to backend
require("dotenv").config(); // Load environment variables

const app = express();
const port = 3000;

// PostgreSQL connection
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
client.connect();

// Middleware
app.use(bodyParser.json());
app.use(cors()); // Enable CORS for frontend access
app.use("/uploads", express.static("uploads")); // Serve uploaded images

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Save images in "uploads" directory
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Rename file with timestamp
  },
});

const upload = multer({ storage: storage });

// ------------------------ USER REGISTRATION ------------------------
app.post("/register", async (req, res) => {
  const { email, phone, fullName, password } = req.body;

  try {
    if (!password) return res.status(400).send("Password is required");

    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `INSERT INTO users (email, phone, full_name, password_hash) VALUES ($1, $2, $3, $4)`;
    await client.query(query, [email, phone, fullName, hashedPassword]);

    res.status(200).send("User registered successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering user");
  }
});

// ------------------------ USER LOGIN ------------------------
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const query = "SELECT * FROM users WHERE email = $1";
    const { rows } = await client.query(query, [email]);

    if (rows.length === 0) return res.status(400).send("Invalid email");

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (isMatch) {
      res.status(200).send("User logged in successfully");
    } else {
      res.status(400).send("Invalid password");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing login");
  }
});

// ------------------------ UPLOAD PRODUCT ------------------------
app.post("/uploadProduct", upload.single("image"), async (req, res) => {
  try {
    const { name, description, price, quantity } = req.body;
    if (!req.file) return res.status(400).send("Image is required");

    const imageUrl = `/uploads/${req.file.filename}`;

    const query = `
      INSERT INTO products (name, description, price, stock_quantity, image_url) 
      VALUES ($1, $2, $3, $4, $5)`;
    const values = [name, description, price, quantity, imageUrl];

    await client.query(query, values);
    res.status(200).json({ message: "Product uploaded successfully", imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error uploading product");
  }
});

// ------------------------ GET PRODUCTS ------------------------
app.get("/getProducts", async (req, res) => {
  try {
    const query = "SELECT id, name, description, price, stock_quantity, image_url FROM products";
    const { rows } = await client.query(query);
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving products");
  }
});

// ------------------------ UPDATE USER ------------------------
app.post("/updateUser", async (req, res) => {
  const { email, full_name, phone, address } = req.body;

  try {
    if (!email) return res.status(400).send("Email is required");

    const query = `
      UPDATE users 
      SET full_name = $1, phone = $2, address = $3
      WHERE email = $4
      RETURNING full_name, email, phone, address`;
    const values = [full_name, phone, address, email];

    const { rows } = await client.query(query, values);
    if (rows.length === 0) return res.status(404).send("User not found");

    res.status(200).json({ message: "Profile updated successfully", user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating profile");
  }
});

// ------------------------ GET USER INFO ------------------------
app.post("/getUser", async (req, res) => {
  const { email } = req.body;

  try {
    const query = "SELECT full_name, email, phone, address FROM users WHERE email = $1";
    const { rows } = await client.query(query, [email]);

    if (rows.length === 0) return res.status(404).send("User not found");

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving user details");
  }
});

// ------------------------ SERVER START ------------------------
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
