import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'path'
import Subject from './models/Subject.js'
import Request from './models/Request.js'
import Paper from './models/Paper.js'

dotenv.config()

const app = express()
const PORT = 5000

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static('uploads'))

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB connection error:', err))

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads'),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
        cb(null, unique + path.extname(file.originalname))
    },
})
const upload = multer({ storage })

app.get('/', (req, res) => {
    res.send('PaperTrail API is running')
})

app.get('/api/subjects', async (req, res) => {
    const subjects = await Subject.find()
    res.json(subjects)
})

app.get('/api/subjects/:code', async (req, res) => {
    const subject = await Subject.findOne({ code: req.params.code })
    if (!subject) return res.status(404).json({ error: 'Not found' })
    res.json(subject)
})

app.get('/api/search', async (req, res) => {
    const q = req.query.q || ''
    const results = await Subject.find({
        $or: [
            { code: { $regex: q, $options: 'i' } },
            { name: { $regex: q, $options: 'i' } },
        ],
    })
    res.json(results)
})

app.get('/api/requests', async (req, res) => {
    const requests = await Request.find().sort({ upvotes: -1 })
    res.json(requests)
})

app.post('/api/requests', async (req, res) => {
    const { code, name, examType, year } = req.body
    const newRequest = await Request.create({ code, name, examType, year })
    res.status(201).json(newRequest)
})

app.post('/api/requests/:id/upvote', async (req, res) => {
    const updated = await Request.findByIdAndUpdate(
        req.params.id,
        { $inc: { upvotes: 1 } },
        { new: true }
    )
    res.json(updated)
})

app.post('/api/papers', upload.single('file'), async (req, res) => {
    const { code, name, department, semester, scheme, examType, year } = req.body
    const newPaper = await Paper.create({
        code, name, department, semester, scheme, examType, year,
        fileUrl: `/uploads/${req.file.filename}`,
        fileSizeKB: Math.round(req.file.size / 1024),
    })
    res.status(201).json(newPaper)
})

app.get('/api/papers/:code', async (req, res) => {
    const papers = await Paper.find({ code: req.params.code })
    res.json(papers)
})

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})