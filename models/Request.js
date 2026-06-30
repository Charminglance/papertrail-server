import mongoose from 'mongoose'

const requestSchema = new mongoose.Schema({
    code: { type: String, required: true },
    name: { type: String, required: true },
    examType: String,
    year: Number,
    upvotes: { type: Number, default: 0 },
}, { timestamps: true })

const Request = mongoose.model('Request', requestSchema)

export default Request