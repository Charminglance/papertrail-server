import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'path'
import fs, { mkdirSync } from 'fs'
import { PDFParse } from 'pdf-parse'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { v2 as cloudinary } from 'cloudinary'
import Subject from './models/Subject.js'
import Request from './models/Request.js'
import Paper from './models/Paper.js'

dotenv.config()
mkdirSync('uploads', { recursive: true })

const app = express()
const PORT = 5000

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static('uploads'))

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB connection error:', err))

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

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

app.post('/api/papers', upload.single('file'), async (req, res) => {
    try {
        const { code, name, department, semester, scheme, examType, year, contentType } = req.body

        console.log('Upload received - code:', code, 'name:', name)

        // Upload to Cloudinary
        const cloudResult = await cloudinary.uploader.upload(req.file.path, {
            resource_type: 'raw',
            folder: 'papertrail',
            public_id: `${code}_${examType}_${year}_${Date.now()}`,
        })

        // Delete temp file from disk
        fs.unlinkSync(req.file.path)

        const newPaper = await Paper.create({
            code, name, department, semester, scheme, examType, year,
            contentType: contentType || 'Question Paper',
            fileUrl: cloudResult.secure_url,
            fileSizeKB: Math.round(req.file.size / 1024),
        })

        console.log('Paper created:', newPaper._id)
        console.log('Upsert code:', code.toUpperCase(), 'name:', name)

        const upsertResult = await Subject.findOneAndUpdate(
            { code: code.toUpperCase() },
            {
                $setOnInsert: {
                    code: code.toUpperCase(),
                    name,
                    department: department || '',
                    semester: semester ? Number(semester) : null,
                    scheme: scheme || '',
                },
                $push: {
                    papers: {
                        examType,
                        year,
                        fileSizeKB: newPaper.fileSizeKB,
                    },
                },
            },
            { upsert: true, new: true }
        )

        console.log('Upsert result:', JSON.stringify(upsertResult))

        res.status(201).json(newPaper)
    } catch (err) {
        console.error('Upload error:', err)
        res.status(500).json({ error: 'Upload failed' })
    }
})

app.get('/api/papers/:code', async (req, res) => {
    const papers = await Paper.find({ code: req.params.code })
    res.json(papers)
})

app.post('/api/requests/:id/upvote', async (req, res) => {
    const updated = await Request.findByIdAndUpdate(
        req.params.id,
        { $inc: { upvotes: 1 } },
        { new: true }
    )
    res.json(updated)
})

app.post('/api/scan', upload.single('file'), async (req, res) => {
    try {
        const buffer = fs.readFileSync(req.file.path)
        const parser = new PDFParse({ data: buffer })
        const result = await parser.getText()
        await parser.destroy()
        const text = result.text.slice(0, 2000)

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
        const prompt = `You are extracting metadata from the cover page text of a KTU (APJ Abdul Kalam Technological University) question paper or internal exam paper.

Respond with ONLY raw JSON in exactly this shape, no markdown formatting, no explanation:
{
  "code": string,
  "name": string,
  "examType": string,
  "year": number or null,
  "department": string,
  "semester": number or null,
  "scheme": string,
  "contentType": string
}

Rules:
- "code" must be the official KTU subject code pattern (e.g. CST303, MCN301, HUT300). If not clearly present, use "".
- "name" is the full subject name as printed. If not clearly present, use "".
- "examType" must be EXACTLY one of: "University Exam", "Series Test 1", "Series Test 2". Infer from context (e.g. "First Series Test" → "Series Test 1", "End Semester Examination" → "University Exam"). If unclear, use "".
- "year" must be a 4-digit number (e.g. 2024). If not found, use null.
- "department" must be EXACTLY one of: "CSE", "ECE", "ME", "CE", "EEE". Infer from subject code prefix or any department mention. If unclear, use "".
- "semester" must be a number 1-8. Infer from subject code. If unclear, use null.
- "scheme" must be EXACTLY one of: "2019", "2024". Infer from any scheme/regulation mention. If unclear, use "".
- "contentType" must be EXACTLY one of: "Question Paper", "Notes", "Syllabus", "Other". Infer from context — syllabus documents usually say "syllabus" or list module topics without questions; notes have explanatory content; question papers have questions numbered 1-10 etc.
- If the text looks garbled, scanned without OCR, or unrelated to an exam paper, return all empty/null values.

Example output: {"code": "CST303", "name": "Computer Networks", "examType": "University Exam", "year": 2024, "department": "CSE", "semester": 5, "scheme": "2019", "contentType": "Question Paper"}

Paper text:
"""
${text}
"""`

        const result2 = await model.generateContent(prompt)
        const responseText = result2.response.text().trim()
        const cleaned = responseText.replace(/```json|```/g, '').trim()
        const extracted = JSON.parse(cleaned)

        fs.unlinkSync(req.file.path)

        res.json(extracted)
    } catch (err) {
        console.error('Scan error:', err)
        res.status(500).json({ error: 'Could not auto-tag this file', code: '', name: '', examType: '', year: null, department: '', semester: null, scheme: '', contentType: '' })
    }
})

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})