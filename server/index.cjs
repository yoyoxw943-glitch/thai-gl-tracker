require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const { setupAuthRoutes } = require('./auth.cjs')
const { setupReviewRoutes } = require('./reviews.cjs')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

setupAuthRoutes(app)
setupReviewRoutes(app)

// Serve static build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
