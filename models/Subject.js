import mongoose from 'mongoose'

const paperSchema = new mongoose.Schema({
    examType: String,
    year: Number,
    fileSizeKB: Number,
})

const subjectSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    department: String,
    semester: Number,
    scheme: String,
    papers: [paperSchema],
})

const Subject = mongoose.model('Subject', subjectSchema)

export default Subject