export default function handler(req, res) {
    res.status(200).json({
        success: true,
        message: 'ShareAnywhere API is running',
        timestamp: new Date().toISOString(),
    });
}