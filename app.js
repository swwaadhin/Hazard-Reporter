const express=require("express");
const app= express(); 
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const session = require("express-session");
const flash = require("connect-flash");
const bcrypt = require("bcrypt");
const Reporter=require("./models/reporter")
const Hazard=require("./models/hazard");
const { generateToken, verifyToken } = require("./middleware/isloggedin.js");
const cookieParser = require("cookie-parser");
const nodemailer = require("nodemailer");
const multer = require("multer");
const jwt = require('jsonwebtoken');

app.set("view engine", "ejs");
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(express.static("uploads"));
app.use(
    session({
        secret: "your_secret_key",
        resave: false,
        saveUninitialized: false
    })
);
app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.welcome = req.flash("welcome");
  next();
});

app.use((req, res, next) => {
  console.log("Session contents:", req.session);
  next();
});

// Set up multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

//mongodb connection - FIXED: Removed deprecated options
mongoose.connect("mongodb://127.0.0.1:27017/Reporter")
.then(() => console.log("Connected to MongoDB"))
.catch(err => console.log("MongoDB Connection Error:", err));

// FIXED: Root route redirects to home
app.get("/",(req,res)=>{
     res.redirect("/home");
});

app.get("/login", (req, res) => {
    const formData = req.flash("formData")[0] || {};
    const error = req.flash("error")[0];
    console.log("Flash error received at /login:", error);

    res.render("login", {
        formData,
        error
    });
});

//post register
app.post("/register", async (req, res) => {
    try {
        const { fullname, email, phone, password } = req.body;

        // 🔍 Check if user already exists
        const existingUser = await Reporter.findOne({
            $or: [{ email }, { phone }]
        });

       if (existingUser) {
        req.flash("error", "Email or phone number already registered!");
        req.flash("formData", { fullname, email, phone });
        console.log("Set flash error:", "Email or phone number already registered!");
        return res.redirect("/login");
    }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new Reporter({
            fullname,
            email,
            phone,
            password: hashedPassword
        });

        console.log(newUser);

        await newUser.save();
         req.session.reporterId = newUser._id;
         console.log(newUser._id);
         console.log(req.session.reporterId);

          await Reporter.findOneAndUpdate({ email: 'sahooswadhin216@gmail.com' }, { role: 'admin' });

        const token = generateToken(newUser);
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 2 * 60 * 60 * 1000,
        });

        // ✅ Send welcome email
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "sahooswadhin216@gmail.com",
                pass: "bcfm fndo jxqo xvrm"
            }
        });

        const mailOptions = {
            from: "sahooswadhin216@gmail.com",
            to: email,
            subject: "Welcome to Our Platform!",
            text: `Hi ${fullname},\n\nThanks for registering with us! We're excited to have you on board.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Email send error:", error);
            } else {
                console.log("Email sent:", info.response);
            }
        });

        req.flash("success", "Registration successful! Welcome.");
        res.redirect("/post_home"); // FIXED: Redirect to post_home route

    } catch (error) {
        console.error("Registration error:", error);
        req.flash("error", "Something went wrong. Please try again.");
        res.redirect("/login");
    }
});

//post login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const reporter = await Reporter.findOne({ email });
    if (!reporter) {
      return res.redirect('/login?error=user_not_found');
    }

    const isMatch = await bcrypt.compare(password, reporter.password);
    if (!isMatch) {
      return res.redirect('/login?error=invalid_password');
    }

    // ✅ Fixed: Use jwt.sign directly
    const token = jwt.sign(
      { 
        userId: reporter._id,
        email: reporter.email 
      }, 
      process.env.JWT_SECRET || 'your-secret-key', 
      { expiresIn: '24h' }
    );

    res.cookie('token', token, { 
      httpOnly: true, 
      secure: false,
      maxAge: 24 * 60 * 60 * 1000 
    });

    console.log('✅ Login successful for user:', reporter.email);
    res.redirect('/post_home');
  } catch (error) {
    console.error('❌ Login error:', error);
    res.redirect('/login?error=server_error');
  }
});

//logout
app.get("/logout", (req, res) => {
    res.clearCookie("token"); // ✅ Remove JWT Cookie
    req.session.destroy((err) => { // ✅ Destroy session (if any)
        if (err) {
            console.error("Session destruction error:", err);
            return res.redirect("/");
        }
        res.redirect("/"); // ✅ Redirect to login page after logout
    });
});

// FIXED: Add missing post_home route
app.get("/post_home", verifyToken, (req, res) => {
    try {
        res.render("post_home", { user: req.user });
    } catch (error) {
        console.error("Error rendering post_home:", error);
        res.redirect("/home");
    }
});

// FIXED: Add missing post_about route
app.get("/post_about", verifyToken, (req, res) => {
    try {
        res.render("post_about", { user: req.user });
    } catch (error) {
        console.error("Error rendering post_about:", error);
        res.redirect("/about");
    }
});

//post home
app.get("/home", verifyToken, (req, res) => {
    const user = req.user;
    if(user){
        res.render("post_home", { user: req.user });
    }
    else{
        res.render("home");
    }
});

//post about
app.get("/about", verifyToken, (req, res) => {
    const user = req.user;
    if(user){
        res.render("post_about", { user: req.user });
    }
    else{
        res.render("about");
    }
});

//report
app.get("/report", verifyToken, (req, res) => {
    const user = req.user;
    if(user){
        res.render("report", { user: req.user });
    }
    else{
        res.render("/login"); 
    }
});

//how to use
app.get("/htu", verifyToken, (req, res) => {
    const user = req.user;
    if(user){
        res.render("htu", { user: req.user });
    }
    else{
        res.render("htu");
    }
});

// All reports
app.get("/allreports", verifyToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      // ✅ Show public version of all reports
      const reports = await Hazard.find()
        .sort({ createdAt: -1 })
        .populate("reporter", "fullname");
      return res.render("allreports", { user: null, reports });
    }

    const reports = await Hazard.find()
      .sort({ createdAt: -1 })
      .populate("reporter", "fullname");

    res.render("allreports", { user, reports });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).send("Server error while fetching reports.");
  }
});
//track
app.get("/track", verifyToken, async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.redirect("/login");  // ✅ Redirect to login for tracking
    }

    const reporter = await Reporter.findById(user._id).populate("reportedHazards");

    if (!reporter) {
      return res.status(404).send("User not found");
    }

    res.render("track", { hazards: reporter.reportedHazards });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).send("Server error while fetching reports.");
  }
});

// POST /report////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// app.post("/report", verifyToken, upload.single("image"), async (req, res) => {
//   try {
//     console.log('📝 Report submission started...');
//     console.log('Body:', req.body);
//     console.log('File:', req.file);
//     console.log('User:', req.user);

//     const { useChatbotImage, chatbotImageData, title, description, location, mapLink, catagory } = req.body;
//     const reporterId = req.user ? req.user._id : null;

//     // Validate required fields
//     if (!title || !description || !location || !catagory) {
//       console.log('⚠️ Missing required fields');
//       return res.status(400).send("Please fill in all required fields.");
//     }

//     let imageFilename = '';

//     // FIXED: Handle chatbot image (base64 data)
//     if (useChatbotImage === 'true' && chatbotImageData) {
//       console.log('🤖 Processing chatbot image...');
//       try {
//         const matches = chatbotImageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
//         if (!matches) {
//           throw new Error('Invalid base64 image format');
//         }
        
//         const imageType = matches[1];
//         const base64Data = matches[2];
//         const buffer = Buffer.from(base64Data, 'base64');
        
//         const timestamp = Date.now();
//         imageFilename = `chatbot-${timestamp}.${imageType}`;
//         const filepath = path.join(__dirname, 'public/uploads', imageFilename);
        
//         // Ensure uploads directory exists
//         if (!fs.existsSync(path.join(__dirname, 'public/uploads'))) {
//           fs.mkdirSync(path.join(__dirname, 'public/uploads'), { recursive: true });
//         }
        
//         fs.writeFileSync(filepath, buffer);
//         console.log('✅ Chatbot image saved:', imageFilename);
//       } catch (imageError) {
//         console.error('❌ Error saving chatbot image:', imageError);
//         return res.status(500).send("Failed to save chatbot image.");
//       }
//     }
//     // FIXED: Handle regular uploaded file with proper null check
//     else if (req.file && req.file.filename) {
//       imageFilename = req.file.filename; // ✅ Safe to access now
//       console.log('✅ Regular image uploaded:', imageFilename);
//     }
//     else {
//       console.log('⚠️ No image provided');
//       return res.status(400).send("Please upload an image or use the chatbot image.");
//     }

//     // FIXED: Validate imageFilename
//     if (!imageFilename) {
//       console.log('❌ No valid image filename generated');
//       return res.status(400).send("Failed to process image. Please try again.");
//     }

//     // Create hazard object
//     const hazard = new Hazard({
//       title: title.trim(),
//       image: imageFilename, // This will now always have a value
//       description: description.trim(),
//       location: location.trim(),
//       mapLink: mapLink || '',
//       catagory: catagory,
//       reporter: reporterId,
//     });

//     // Save the new hazard
//     await hazard.save();

//     // Push hazard._id into reporter's reportedHazards if user is logged in
//     if (reporterId) {
//       await Reporter.findByIdAndUpdate(reporterId, {
//         $push: { reportedHazards: hazard._id },
//       });
//     }

//     console.log('📝 Report saved successfully:', hazard.title);
//     console.log('🖼️ Image saved as:', imageFilename);

//     // FIXED: Redirect to allreports instead of sending text
//     res.redirect('/allreports?success=true');

//   } catch (error) {
//     console.error('❌ Error processing report:', error);
//     res.status(500).send("An error occurred while saving the report: " + error.message);
//   }
// });


const axios= require('axios');

app.post("/report", verifyToken, upload.single("image"), async (req, res) => {
  try {
    console.log('📝 Report submission started...');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    console.log('User:', req.user);

    const { useChatbotImage, chatbotImageData, title, description, location, mapLink, catagory } = req.body;
    const reporterId = req.user ? req.user._id : null;

    // Validate required fields
    if (!title || !description || !location || !catagory || !mapLink) {
      console.log('⚠️ Missing required fields');
      return res.status(400).send("Please fill in all required fields including map link.");
    }

    // STEP 1: Extract coordinates from Google Maps link
    let hazardCoordinates = [0, 0]; // Default coordinates
    try {
      console.log('🗺️ Extracting coordinates from map link:', mapLink);
      
      // Extract coordinates from various Google Maps link formats
      const coordRegex = [
        /@(-?\d+\.\d+),(-?\d+\.\d+)/, // @lat,lng format
        /q=(-?\d+\.\d+),(-?\d+\.\d+)/, // q=lat,lng format
        /center=(-?\d+\.\d+),(-?\d+\.\d+)/, // center=lat,lng format
        /ll=(-?\d+\.\d+),(-?\d+\.\d+)/ // ll=lat,lng format
      ];

      let coordinates = null;
      for (const regex of coordRegex) {
        const match = mapLink.match(regex);
        if (match) {
          const latitude = parseFloat(match[1]);
          const longitude = parseFloat(match[2]);
          coordinates = [longitude, latitude]; // GeoJSON format: [lng, lat]
          break;
        }
      }

      if (coordinates) {
        hazardCoordinates = coordinates;
        console.log('✅ Coordinates extracted:', hazardCoordinates);
      } else {
        console.log('⚠️ Could not extract coordinates from map link');
      }
    } catch (coordError) {
      console.error('❌ Error extracting coordinates:', coordError);
    }

    // STEP 2: Handle image upload (existing code)
    let imageFilename = '';
    let newImagePath = '';

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
        newImagePath = path.join(__dirname, 'public/uploads', imageFilename);
        
        if (!fs.existsSync(path.join(__dirname, 'public/uploads'))) {
          fs.mkdirSync(path.join(__dirname, 'public/uploads'), { recursive: true });
        }
        
        fs.writeFileSync(newImagePath, buffer);
        console.log('✅ Chatbot image saved:', imageFilename);
      } catch (imageError) {
        console.error('❌ Error saving chatbot image:', imageError);
        return res.status(500).send("Failed to save chatbot image.");
      }
    }
    else if (req.file && req.file.filename) {
      imageFilename = req.file.filename;
      newImagePath = path.join(__dirname, 'public/uploads', imageFilename);
      console.log('✅ Regular image uploaded:', imageFilename);
    }
    else {
      console.log('⚠️ No image provided');
      return res.status(400).send("Please upload an image or use the chatbot image.");
    }

    if (!imageFilename) {
      console.log('❌ No valid image filename generated');
      return res.status(400).send("Failed to process image. Please try again.");
    }

    // STEP 3: DUPLICATE DETECTION - Check ALL hazards within 200 meters (any category)
    try {
      console.log('🔍 Checking for duplicate hazards within 200 meters...');
      
      // UPDATED: Find ALL nearby hazards within 200 meters (removed category filter)
      const nearbyHazards = await Hazard.find({
        coordinates: {
          $geoWithin: {
            $centerSphere: [
              hazardCoordinates, // [longitude, latitude]
              200 / 6378100 // Convert 200 meters to radians
            ]
          }
        }
        // REMOVED: catagory filter - now checking ALL categories
      });

      console.log(`🔍 Found ${nearbyHazards.length} nearby hazards (ALL categories) within 200m to check for duplicates`);

      // Check each nearby hazard for image similarity (ALL categories)
      for (let hazard of nearbyHazards) {
        try {
          const existingImagePath = path.join(__dirname, "public/uploads", hazard.image);
          
          if (fs.existsSync(existingImagePath)) {
            console.log(`📷 Comparing with existing hazard: ${hazard.title} (Category: ${hazard.catagory})`);
            
            const response = await axios.post("http://localhost:5001/compare", null, {
              params: {
                img1: newImagePath,
                img2: existingImagePath
              },
              timeout: 10000 // 10 second timeout
            });

            console.log(`🔍 Similarity check result:`, response.data);

            if (response.data.similar) {
              console.log(`❌ Duplicate detected! Similar to: ${hazard.title} (Category: ${hazard.catagory})`);
              
              // Delete the uploaded image since it's a duplicate
              if (fs.existsSync(newImagePath)) {
                fs.unlinkSync(newImagePath);
                console.log('🗑️ Deleted duplicate image file');
              }
              
              const errorMessage = `This hazard already exists in the area. Similar hazard found: "${hazard.title}" in "${hazard.catagory}" category. Check existing reports.`;
            return res.redirect(`/report?error=duplicate_hazard&title=${encodeURIComponent(hazard.title)}&category=${encodeURIComponent(hazard.catagory)}`);
            }
          } else {
            console.log(`⚠️ Image file not found for hazard: ${hazard.title}`);
          }
        } catch (compareError) {
          console.error(`❌ Error comparing with hazard ${hazard.title}:`, compareError.message);
          // Continue checking other hazards even if one comparison fails
        }
      }

      console.log('✅ No duplicates found in 200m radius, proceeding with hazard creation');

    } catch (duplicateCheckError) {
      console.error('❌ Error during duplicate detection:', duplicateCheckError);
      // Continue with hazard creation even if duplicate check fails
      console.log('⚠️ Continuing with hazard creation despite duplicate check failure');
    }

    // STEP 4: Create and save hazard with coordinates (only if no duplicates found)
    const hazard = new Hazard({
      title: title.trim(),
      image: imageFilename,
      description: description.trim(),
      location: location.trim(),
      mapLink: mapLink.trim(),
      catagory: catagory,
      reporter: reporterId,
      coordinates: {
        type: 'Point',
        coordinates: hazardCoordinates // [longitude, latitude]
      }
    });

    await hazard.save();
    console.log('💾 Hazard saved with coordinates:', hazardCoordinates);

    // Update reporter's hazards if logged in
    if (reporterId) {
      await Reporter.findByIdAndUpdate(reporterId, {
        $push: { reportedHazards: hazard._id },
      });
    }

    // STEP 5: Find nearby users within 200 meters radius for email notifications
    try {
      console.log('👥 Finding nearby users within 200 meters for email notifications...');
      
      const nearbyUsers = await Reporter.find({
        location: {
          $geoWithin: {
            $centerSphere: [
              hazardCoordinates, // [longitude, latitude]
              200 / 6378100 // Convert 200 meters to radians (Earth radius = 6378100 meters)
            ]
          }
        },
        email: { $exists: true, $ne: '' }, // Only users with valid email
        _id: { $ne: reporterId } // Exclude the reporter themselves
      });

      console.log(`📧 Found ${nearbyUsers.length} nearby users to notify (excluding reporter)`);

      // STEP 6: Send email notifications to nearby users
      if (nearbyUsers.length > 0) {
        // Configure nodemailer
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: "sahooswadhin216@gmail.com", // Your email
            pass: "bcfm fndo jxqo xvrm" // Your app password
          }
        });

        // Send emails to all nearby users
        const emailPromises = nearbyUsers.map(async (user) => {
          try {
            const mailOptions = {
              from: "sahooswadhin216@gmail.com",
              to: user.email,
              subject: "🚨 New Hazard Reported Near Your Location - WolvesNITR",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">🚨 HAZARD ALERT</h1>
                    <p style="color: white; margin: 5px 0;">WolvesNITR Hazard Reporting System</p>
                  </div>
                  
                  <div style="padding: 20px; background: #f8f9fa;">
                    <h2 style="color: #333;">Hi ${user.fullname || 'User'},</h2>
                    
                    <p style="color: #666; font-size: 16px;">
                      A new hazard has been reported near your location (within 200 meters):
                    </p>
                    
                    <div style="background: white; padding: 20px; border-radius: 10px; border-left: 4px solid #dc3545; margin: 20px 0;">
                      <h3 style="color: #dc3545; margin: 0 0 10px 0;">📍 ${hazard.title}</h3>
                      <p style="margin: 5px 0;"><strong>Category:</strong> ${hazard.catagory}</p>
                      <p style="margin: 5px 0;"><strong>Location:</strong> ${hazard.location}</p>
                      <p style="margin: 5px 0;"><strong>Description:</strong> ${hazard.description}</p>
                      <p style="margin: 15px 0 5px 0;"><strong>Reported:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${hazard.mapLink}" 
                         style="background: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        📍 View Location on Map
                      </a>
                    </div>
                    
                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffeaa7;">
                      <p style="margin: 0; color: #856404;">
                        <strong>⚠️ Safety Advice:</strong> Please exercise caution when traveling in this area. 
                        Stay alert and consider alternative routes if necessary.
                      </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px;">
                      <p style="color: #888; font-size: 14px;">
                        This is an automated notification from WolvesNITR Hazard Reporting System.<br>
                        Stay safe and help keep our community informed!
                      </p>
                    </div>
                  </div>
                </div>
              `
            };

            await transporter.sendMail(mailOptions);
            console.log(`✅ Email sent to: ${user.email}`);
            return { success: true, email: user.email };
          } catch (emailError) {
            console.error(`❌ Failed to send email to ${user.email}:`, emailError);
            return { success: false, email: user.email, error: emailError.message };
          }
        });

        // Wait for all emails to be sent
        const emailResults = await Promise.allSettled(emailPromises);
        const successCount = emailResults.filter(result => 
          result.status === 'fulfilled' && result.value.success
        ).length;

        console.log(`📧 Email notifications sent: ${successCount}/${nearbyUsers.length}`);
      } else {
        console.log('📧 No nearby users found to notify');
      }

    } catch (locationError) {
      console.error('❌ Error finding nearby users or sending emails:', locationError);
      // Don't fail the entire request if email notifications fail
    }

    console.log('📝 Report saved successfully:', hazard.title);
    console.log('🖼️ Image saved as:', imageFilename);

    res.redirect('/allreports?success=true');

  } catch (error) {
    console.error('❌ Error processing report:', error);
    res.status(500).send("An error occurred while saving the report: " + error.message);
  }
});



///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////passport setup  //////////////////
const passport = require("passport");
require("./passport-config"); // import passport config

app.use(passport.initialize());
app.use(passport.session());

app.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// FIXED: Google OAuth callback
app.get("/auth/google/callback",
 passport.authenticate('google', { failureRedirect: '/login' }),
  async (req, res) => {
    try {
      // ✅ Fixed: Use jwt.sign directly instead of undefined generateToken function
      const token = jwt.sign(
        { 
          userId: req.user._id,
          email: req.user.email 
        }, 
        process.env.JWT_SECRET || 'your-secret-key', 
        { expiresIn: '24h' }
      );
      
      res.cookie('token', token, { 
        httpOnly: true, 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
      
      console.log('✅ Google OAuth successful for user:', req.user.email);
      res.redirect('/post_home');
    } catch (error) {
      console.error('❌ Error in Google callback:', error);
      res.redirect('/login?error=auth_failed');
    }
  }
);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//admin
const isAdmin = require("./middleware/isadmin.js");

app.get("/admin/reports", verifyToken, isAdmin, async (req, res) => {
  const reports = await Hazard.find().populate('reporter');
  res.render("adminDashboard.ejs", { reports });
});

///voting  routes
app.post("/hazard/:id/vote/:type", verifyToken, async (req, res) => {
  try {
    const { id, type } = req.params;
    
    console.log(`📊 Voting request: ${type} for report ${id}`);

    // Validate vote type
    if (!["true", "false"].includes(type)) {
      return res.status(400).json({ error: "Invalid vote type" });
    }

    // Find hazard
    const hazard = await Hazard.findById(id);
    if (!hazard) {
      return res.status(404).json({ error: "Hazard not found" });
    }

    // FIXED: Initialize flag if it doesn't exist
    if (!hazard.flag) {
      hazard.flag = {
        trueVotes: 0,
        falseVotes: 0,
        voters: []
      };
    }

    // FIXED: Handle both authenticated and anonymous users
    const userId = req.user ? req.user._id : null;
    
    if (userId) {
      // Authenticated user - track their vote
      const existingVoteIndex = hazard.flag.voters.findIndex(v => 
        v.user && v.user.toString() === userId.toString()
      );

      if (existingVoteIndex === -1) {
        // First-time voting
        hazard.flag.voters.push({ user: userId, vote: type });
        hazard.flag[`${type}Votes`] = (hazard.flag[`${type}Votes`] || 0) + 1;
      } else {
        const existingVote = hazard.flag.voters[existingVoteIndex];

        if (existingVote.vote === type) {
          // Withdraw vote
          hazard.flag[`${type}Votes`] = Math.max(0, (hazard.flag[`${type}Votes`] || 0) - 1);
          hazard.flag.voters.splice(existingVoteIndex, 1);
        } else {
          // Change vote
          hazard.flag[`${existingVote.vote}Votes`] = Math.max(0, (hazard.flag[`${existingVote.vote}Votes`] || 0) - 1);
          hazard.flag[`${type}Votes`] = (hazard.flag[`${type}Votes`] || 0) + 1;
          hazard.flag.voters[existingVoteIndex].vote = type;
        }
      }
    } else {
      // Anonymous user - simple vote counting
      hazard.flag[`${type}Votes`] = (hazard.flag[`${type}Votes`] || 0) + 1;
    }

    await hazard.save();

    console.log(`✅ Vote counted! True: ${hazard.flag.trueVotes}, False: ${hazard.flag.falseVotes}`);

    res.json({
      success: true,
      trueVotes: hazard.flag.trueVotes || 0,
      falseVotes: hazard.flag.falseVotes || 0
    });

  } catch (error) {
    console.error('❌ Voting error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get("/hazard/:id/comments", async (req, res) => {
  try {
    const hazard = await Hazard.findById(req.params.id)
      .populate("comments.commenter", "fullname email") // Populate commenter details
      .exec();

    if (!hazard) {
      return res.status(404).send("Hazard not found");
    }

    res.render("comments", { hazard });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.post('/admin/hazard/status/:id', async (req, res) => {
  try {
    const hazardId = req.params.id;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['Reported', 'Acknowledged', 'In Progress', 'Resolved', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).send("Invalid status value.");
    }

    // Update in DB
    await Hazard.findByIdAndUpdate(hazardId, { status });

    res.redirect('/admin/reports'); // or wherever your dashboard is
  } catch (err) {
    console.error('Error updating hazard status:', err);
    res.status(500).send("Failed to update status.");
  }
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.post("/hazard/:id/comments",verifyToken, async (req, res) => {
  try {
    const { commentText } = req.body;

    await Hazard.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          comments: {
            text: commentText,
            commenter: req.user._id // ensure user is authenticated
          }
        }
      },
      { new: true }
    );

    res.redirect(`/hazard/${req.params.id}/comments`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Could not add comment");
  }
});

//add location of the residence
app.get("/add-location", verifyToken, (req, res) => {
  res.render("add-location", { user: req.user });
});

//post add location
app.post('/add-location', verifyToken, async (req, res) => {
  try {
    const { mapLink } = req.body;

    // Extract latitude and longitude from link
    const match = mapLink.match(/@?(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || mapLink.match(/q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);

    if (!match) {
      return res.status(400).send("Invalid Google Maps link.");
    }

    const latitude = parseFloat(match[1]);
    const longitude = parseFloat(match[2]);

    // Update reporter's location in DB
    await Reporter.findByIdAndUpdate(req.user._id, {
      location: {
        type: "Point",
        coordinates: [longitude, latitude] // GeoJSON format: [lng, lat]
      }
    });

    res.status(200).send("Location updated successfully.");
  } catch (err) {
    console.error("Error saving location:", err);
    res.status(500).send("Something went wrong.");
  }
});

app.listen(3000,()=>console.log("app is listining"));
