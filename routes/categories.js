const express = require('express');
const { Client } = require('pg');

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect();

// **Create a new category**
router.post('/', async (req, res) => {
    const { category_name } = req.body;

    if (!category_name) {
        return res.status(400).json({ error: 'Category name is required' });
    }

    try {
        const existingCategory = await client.query('SELECT * FROM public.ProductCategories WHERE category_name = $1', [category_name]);
        if (existingCategory.rows.length > 0) {
            return res.status(409).json({ error: 'Category already exists' });
        }

        const query = 'INSERT INTO public.ProductCategories (category_name) VALUES ($1) RETURNING *';
        const { rows } = await client.query(query, [category_name]);

        res.status(201).json({ message: 'Category created successfully', category: rows[0] });
    } catch (err) {
        console.error('❌ Error creating category:', err);
        res.status(500).json({ error: 'Error creating category' });
    }
});

// **Get all categories**
router.get('/', async (req, res) => {
    try {
        const query = 'SELECT * FROM public.ProductCategories ORDER BY category_name ASC';
        const { rows } = await client.query(query);

        res.status(200).json({ categories: rows });
    } catch (err) {
        console.error('❌ Error fetching categories:', err);
        res.status(500).json({ error: 'Error fetching categories' });
    }
});

// **Delete a category**
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid category ID' });
    }

    try {
        const query = 'DELETE FROM public.ProductCategories WHERE category_id = $1 RETURNING *';
        const { rows } = await client.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.status(200).json({ message: 'Category deleted successfully' });
    } catch (err) {
        console.error('❌ Error deleting category:', err);
        res.status(500).json({ error: 'Error deleting category' });
    }
});

router.get('/:id', async (req, res) => {
    const { id } = req.params;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid category ID' });
    }

    try {
        const query = 'SELECT * FROM public.ProductCategories WHERE category_id = $1';
        const { rows } = await client.query(query, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.status(200).json({ category: rows[0] });
    } catch (err) {
        console.error('❌ Error fetching category:', err);
        res.status(500).json({ error: 'Error fetching category' });
    }
});


router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { category_name } = req.body;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid category ID' });
    }

    if (!category_name) {
        return res.status(400).json({ error: 'Category name is required' });
    }

    try {
        // Check if category exists
        const existingCategory = await client.query('SELECT * FROM public.ProductCategories WHERE category_id = $1', [id]);
        if (existingCategory.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Check if category name already exists
        const duplicateCheck = await client.query('SELECT * FROM public.ProductCategories WHERE category_name = $1 AND category_id != $2', [category_name, id]);
        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ error: 'Category name already exists' });
        }

        // Update category
        const query = 'UPDATE public.ProductCategories SET category_name = $1 WHERE category_id = $2 RETURNING *';
        const { rows } = await client.query(query, [category_name, id]);

        res.status(200).json({ message: 'Category updated successfully', category: rows[0] });
    } catch (err) {
        console.error('❌ Error updating category:', err);
        res.status(500).json({ error: 'Error updating category' });
    }
});


module.exports = router;
