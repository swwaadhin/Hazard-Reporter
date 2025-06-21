const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// In-memory storage for reports
let reports = [];

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function(req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// FIXED: Authentication middleware with null checks
function verifyToken(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      // Allow report submission and viewing without authentication
      if ((req.path === '/report' && req.method === 'POST') || 
          req.path === '/allreports' || 
          req.path === '/home' || 
          req.path === '/about' || 
          req.path === '/htu' ||
          req.path.startsWith('/hazard/')) {
        req.user = null;
        req.userId = null;
        return next();
      }
      return res.redirect('/login');
    }

    const jwt = require('jsonwebtoken');
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
      if (err) {
        // Allow public routes without authentication
        if ((req.path === '/report' && req.method === 'POST') || 
            req.path === '/allreports' || 
            req.path === '/home' || 
            req.path === '/about' || 
            req.path === '/htu' ||
            req.path.startsWith('/hazard/')) {
          req.user = null;
          req.userId = null;
          return next();
        }
        return res.redirect('/login');
      }

      // FIXED: Add comprehensive null checks before accessing _id
      if (decoded && decoded.user) {
        req.user = decoded.user;
        // FIXED: Safe access to _id property
        req.userId = decoded.user._id || decoded.user.id || null;
      } else {
        req.user = null;
        req.userId = null;
      }
      
      next();
    });
  } catch (error) {
    console.error('Token verification error:', error);
    // Allow public routes without authentication
    if ((req.path === '/report' && req.method === 'POST') || 
        req.path === '/allreports' || 
        req.path === '/home' || 
        req.path === '/about' || 
        req.path === '/htu' ||
        req.path.startsWith('/hazard/')) {
      req.user = null;
      req.userId = null;
      return next();
    }
    res.redirect('/login');
  }
}

// Routes with optional authentication
app.get('/', (req, res) => {
  res.redirect('/home');
});

app.get('/home', (req, res) => {  // Remove verifyToken here
  res.render('home');
});

app.get('/about', (req, res) => {  // Remove verifyToken here
  res.render('about');
});

app.get('/htu', (req, res) => {  // Remove verifyToken here
  res.render('htu');
});

app.get('/allreports', (req, res) => {  // Remove verifyToken here
  res.render('allreports', { reports: reports });
});


app.get('/track', (req, res) => {  // Remove verifyToken here
  res.render('track');
});

app.get('/report', verifyToken, (req, res) => {  // Keep verifyToken here
  res.render('reporter');
}); 




// FIXED: Report POST route with authentication middleware
//needed to store the image in the uploads file part
// POST /report - COMPLETE FIXED VERSION
app.post("/report", (req, res, next) => {
  console.log('=== MULTER DEBUG ===');
  console.log('req.file exists:', !!req.file);
  console.log('req.body.useChatbotImage:', req.body.useChatbotImage);
  console.log('req.body.chatbotImageData length:', req.body.chatbotImageData ? req.body.chatbotImageData.length : 0);
  next(); // Continue to the actual route handler
}, verifyToken, upload.single("image"), async (req, res) => {
  try {
    console.log('📝 Report submission started...');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    console.log('User:', req.user);

    const { useChatbotImage, chatbotImageData, title, description, location, mapLink, catagory } = req.body;
    const reporterId = req.user ? req.user._id : null;

    // Validate required fields
    if (!title || !description || !location || !catagory) {
      console.log('⚠️ Missing required fields');
      return res.status(400).send("Please fill in all required fields.");
    }

    let imageFilename = '';

    // FIXED: Handle chatbot image (base64 data)
    if (useChatbotImage === 'true' && chatbotImageData) {
      console.log('🤖 Processing chatbot image...');
      try {
        const matches = chatbotImageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (!matches) {
          throw new Error('Invalid base64 image format');
        }
        
        const imageType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        const timestamp = Date.now();
        imageFilename = `chatbot-${timestamp}.${imageType}`;
        const uploadsDir = path.join(__dirname, 'public/uploads');
        const filepath = path.join(uploadsDir, imageFilename);
        
        // FIXED: Ensure uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
          console.log('📁 Created uploads directory');
        }
        
        fs.writeFileSync(filepath, buffer);
        console.log('✅ Chatbot image saved:', imageFilename);
      } catch (imageError) {
        console.error('❌ Error saving chatbot image:', imageError);
        return res.status(500).send("Failed to save chatbot image: " + imageError.message);
      }
    }
    // FIXED: Handle regular uploaded file with null check
    else if (req.file && req.file.filename) {
      imageFilename = req.file.filename;
      console.log('✅ Regular image uploaded:', imageFilename);
    }
    else {
      console.log('⚠️ No image provided');
      console.log('useChatbotImage:', useChatbotImage);
      console.log('chatbotImageData exists:', !!chatbotImageData);
      console.log('req.file exists:', !!req.file);
      return res.status(400).send("Please upload an image or use the chatbot image.");
    }

    // FIXED: Additional validation for imageFilename
    if (!imageFilename) {
      console.log('❌ No valid image filename generated');
      return res.status(400).send("Failed to process image. Please try again.");
    }

    // Create hazard object
    const hazardData = {
      title: title.trim(),
      image: imageFilename,
      description: description.trim(),
      location: location.trim(),
      mapLink: mapLink ? mapLink.trim() : '',
      catagory: catagory,
      reporter: reporterId,
    };

    console.log('📊 Creating hazard with data:', hazardData);

    const hazard = new Hazard(hazardData);

    // Save to database
    await hazard.save();
    console.log('💾 Hazard saved to database with ID:', hazard._id);

    // Update reporter's reportedHazards if user is logged in
    if (reporterId) {
      await Reporter.findByIdAndUpdate(reporterId, {
        $push: { reportedHazards: hazard._id },
      });
      console.log('👤 Updated reporter\'s hazard list');
    }

    console.log('📝 Report saved successfully:', hazard.title);
    console.log('🖼️ Image saved as:', imageFilename);

    // FIXED: Redirect to allreports with success message
    res.redirect('/allreports?success=true');

  } catch (error) {
    console.error('❌ Complete error details:', error);
    console.error('Error stack:', error.stack);
    
    // FIXED: Better error response
    const errorMessage = error.message || 'Unknown error occurred';
    res.status(500).send(`An error occurred while saving the report: ${errorMessage}`);
  }
});

// FIXED: Voting endpoints with authentication middleware
app.post('/hazard/:id/vote/:type', verifyToken, (req, res) => {
  try {
    const { id, type } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'Report ID is required' });
    }
    
    const report = reports.find(r => r && r._id === id);
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // FIXED: Ensure flag object exists
    if (!report.flag) {
      report.flag = { trueVotes: 0, falseVotes: 0 };
    }
    
    if (type === 'true') {
      report.flag.trueVotes += 1;
    } else if (type === 'false') {
      report.flag.falseVotes += 1;
    } else {
      return res.status(400).json({ error: 'Invalid vote type' });
    }
    
    console.log(`Vote recorded: ${type} for report ${id} by user: ${req.userId || 'anonymous'}`);
    
    res.json({
      success: true,
      trueVotes: report.flag.trueVotes,
      falseVotes: report.flag.falseVotes
    });
    
  } catch (error) {
    console.error('❌ Error voting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Comments endpoint
app.get('/hazard/:id/comments', verifyToken, (req, res) => {
  const { id } = req.params;
  
  if (!id) {
    return res.redirect('/allreports?error=invalid_id');
  }
  
  const report = reports.find(r => r && r._id === id);
  
  if (!report) {
    return res.redirect('/allreports?error=report_not_found');
  }
  
  res.redirect('/allreports');
});

// API endpoint to get reports
app.get('/api/reports', verifyToken, (req, res) => {
  res.json({
    success: true,
    count: reports.length,
    reports: reports,
    user: req.user
  });
});

// FIXED: Error handling middleware with proper redirects
app.use((err, req, res, next) => {
  console.error('❌ Application Error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.redirect('/report?error=file_too_large');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.redirect('/report?error=unexpected_file');
    }
  }
  
  // Handle authentication errors
  if (err.name === 'JsonWebTokenError') {
    return res.redirect('/report?error=auth_error');
  }
  
  return res.redirect('/report?error=server_error');
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${uploadsDir}`);
  console.log(`📊 Reports in memory: ${reports.length}`);
});

module.exports = app;
