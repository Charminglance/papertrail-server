import mongoose from 'mongoose'

const paperSchema = new mongoose.Schema({
    code: { type: String, required: true },
    name: { type: String, required: true },
    department: String,
    semester: Number,
    scheme: String,
    examType: { type: String, required: true },
    year: { type: Number, required: true },
    fileUrl: { type: String, required: true },
    fileSizeKB: Number,
    verifiedCount: { type: Number, default: 0 },
}, { timestamps: true })

const Paper = mongoose.model('Paper', paperSchema)

export default Paper