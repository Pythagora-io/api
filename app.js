const express = require('express');
const passport = require('passport');
const bodyParser = require('body-parser');
const session = require('express-session');
const { v4 } = require('uuid');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GithubStrategy = require('passport-github2').Strategy;
const dotenv = require('dotenv');
const app = express();

dotenv.config();

mongoose.connect('mongodb://localhost/devtool', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Failed to connect to MongoDB:', err));

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: String,
    apiKey: { type: String, default: v4() },
    usage: { type: Number, default: 0 },
    role: { type: String, enum: ['free', 'premium', 'enterprise'], default: 'free' },
    googleId: String,
    githubId: String
});

const User = mongoose.model('User', UserSchema);


// In-memory storage
const users = [];

// Middleware setup
// Enable CORS for all routes
app.use(cors({
    origin: 'http://localhost:5173', // Replace with your Vue.js app's origin
    credentials: true,
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: 'mongodb://localhost:27017/devtool' }),
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport.js setup
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {
    try {
        const user = await User.findOne({ email, password });
        if (user) {
            return done(null, user);
        } else {
            return done(null, false, { message: 'Incorrect email or password.' });
        }
    } catch (err) {
        return done(err);
    }
}));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:4200/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = await User.create({ googleId: profile.id, username: profile.displayName, email: profile.emails[0].value });
        }
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.use(new GithubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: 'http://localhost:4200/auth/github/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ githubId: profile.id });
        if (!user) {
            user = await User.create({ githubId: profile.id, username: profile.username, email: profile.emails[0].value });
        }
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));


passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err);
    }
});


// Routes
app.get('/', (req, res) => {
    res.send(`<h1>Welcome, ${req.user ? req.user.username : 'Guest'}!</h1>`);
});

app.get('/login', (req, res) => {
    res.send('<h1>Login Page</h1>');
});

app.post('/login', (req, res, next) => {
    console.log('.-.-', req.body);
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            return res.status(400).json({errors: {email: [info.message]}});
        }
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            // { success: true, message: 'Login successful', user: req.user }
            return res.json({
                userAbilities: [{
                    action: 'manage',
                    subject: 'all',
                },
                    {
                        action: 'read',
                        subject: 'Auth',
                    },
                    {
                        action: 'read',
                        subject: 'AclDemo',
                    }],
                // userData: req.user,
                // accessToken: req.user.apiKey
                userData: {
                    id: 1,
                    fullName: 'John Doe',
                    username: 'johndoe',
                    password: 'admin',
                    avatar: "/src/assets/images/avatars/avatar-1.png",
                    email: 'admin@demo.com',
                    role: 'admin',
                    abilities: [
                        {
                            action: 'manage',
                            subject: 'all',
                        },
                    ],
                },
                accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Mn0.cat2xMrZLn0FwicdGtZNzL7ifDTAKWB0k1RurSWjdnw"
            });
        });
    })(req, res, next);
});


app.get('/register', (req, res) => {
    res.send('<h1>Register Page</h1>');
});

app.post('/register', async (req, res) => {
    try {
        await User.create({ username: req.body.username, password: req.body.password, email: req.body.email });
        res.redirect('/login');
    } catch (err) {
        res.status(500).send('Error registering user');
    }
});


app.get('/docs', (req, res) => {
    res.send('<h1>Documentation Page</h1>');
});

const apiKeyAuth = async (req, res, next) => {
    const apiKey = req.header('x-api-key');
    if (!apiKey) {
        return res.status(401).send('Access denied. No API key provided.');
    }

    try {
        const user = await User.findOne({ apiKey });
        if (!user) {
            return res.status(401).send('Access denied. Invalid API key.');
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(500).send('Error validating API key.');
    }
};


app.post('/generate-negative-tests', apiKeyAuth, async (req, res) => {
    const user = req.user;
    if (!user) {
        res.status(401).send('Unauthorized');
        return;
    }

    const apiKey = req.body.apiKey;
    const inputData = req.body.data;

    // Check if the user has enough quota for the API requests
    const quota = { free: 100, premium: 1000, enterprise: 10000 }[user.role];
    if (user.usage + inputData.length > quota) {
        res.status(400).send('API request limit exceeded');
        return;
    }

    // Update user's usage
    user.usage += inputData.length;
    await user.save();

    // Call GPT API (implementation not provided)
    // Process the results (implementation not provided)

    res.send('API requests made');
});


// Google and GitHub authentication routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { successRedirect: '/', failureRedirect: '/login' }));
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport.authenticate('github', { successRedirect: '/', failureRedirect: '/login' }));

// Start the server
app.listen(4200, () => {
    console.log('Server started on http://localhost:4200');
});
