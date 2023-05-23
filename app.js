const express = require('express');
const passport = require('passport');
const bodyParser = require('body-parser');
const session = require('express-session');
const { v4 } = require('uuid');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GithubStrategy = require('passport-github2').Strategy;
const dotenv = require('dotenv');
const {getJestTestName, getJestTestFromPythagoraData, getJestAuthFunction, getTokensInMessages, getPromptFromFile} = require("./helpers/openai");
const {MIN_TOKENS_FOR_GPT_RESPONSE, MAX_GPT_MODEL_TOKENS} = require("./const/common");
const app = express();
const { trackAPICall } = require('./helpers/express.js');

dotenv.config();

mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URL }),
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
        sameSite: 'none',
        secure: true,
    }
}));
app.set('trust proxy', 1);

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
    callbackURL: `${process.env.DOMAIN}:${process.env.PORT}/auth/google/callback`
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
    callbackURL: `${process.env.DOMAIN}:${process.env.PORT}/auth/github/callback`
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
    res.status(200).json({username: req.user ? req.user.username : undefined});
});

app.get('/login', (req, res) => {
    res.status(200).send('<h1>Login Page</h1>');
});

app.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return res.status(400).json(err);
        }
        if (!user) {
            return res.status(400).json({errors: {email: [info.message]}});
        }
        req.login(user, (err) => {
            if (err) {
                return res.status(400).send(err);
            }
            res.status(200).json({ message: 'Registration successful' });
        });
    })(req, res, next);
});


app.get('/register', (req, res) => {
    res.send('<h1>Register Page</h1>');
});

app.post('/register', async (req, res) => {
    try {
        if (!req.body.username || !req.body.password || !req.body.email) return res.status(400).send('You need to provide username, password and email!');
        let user = await User.create({ username: req.body.username, password: req.body.password, email: req.body.email });

        // Create session for the user
        req.login(user, (err) => {
            if (err) {
                return res.status(400).send(err);
            }
            res.status(200).json({ message: 'Registration successful' });
        });
    } catch (err) {
        res.status(500).send('Error registering user');
    }
});


app.get('/docs', (req, res) => {
    res.send('<h1>Documentation Page</h1>');
});

const apiKeyAuth = async (req, res, next) => {
    const apiKey = req.headers.apikey;
    const apiKeyType = req.headers.apikeytype;
    if (!apiKey) {
        return res.status(401).send('Access denied. No API key provided.');
    }

    if(apiKeyType !== 'pythagora') return next();
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

app.post('/generate-jest-auth', apiKeyAuth, async (req, res) => {
    try {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        await getJestAuthFunction(req, res);
    } catch (error) {
        res.status(500).write('pythagora_end');
        res.end(error.message);
    }
});
app.post('/generate-jest-test', apiKeyAuth, trackAPICall, async (req, res) => {
    try {
        await getJestTestFromPythagoraData(req, res);
    } catch (error) {
        res.status(500).write('pythagora_end');
        res.end(error.message);
    }
});

app.post('/generate-jest-test-name', apiKeyAuth, async (req, res) => {
    try {
        if (!req.body || !req.body.test) return res.status(400).send('No "test" in body.');

        await getJestTestName(req, res, []);
    } catch (error) {
        res.status(500).write('pythagora_end');
        res.end(error.message);
    }
});

app.post('/check-if-eligible', apiKeyAuth, async (req, res) => {
    try {
        if (!req.body || !req.body.test) return res.status(400).send('No "test" in body.');

        let tokens = getTokensInMessages([
            {"role": "system", "content": "You are a QA engineer and your main goal is to find ways to break the application you're testing. You are proficient in writing automated integration tests for Node.js API servers.\n" +
                    "When you respond, you don't say anything except the code - no formatting, no explanation - only code.\n" },
            {
                "role": "user",
                "content": getPromptFromFile('generateJestTest.txt', { test: req.body.test }),
            },
        ]);

        let isEligibleForExport = (tokens + MIN_TOKENS_FOR_GPT_RESPONSE < MAX_GPT_MODEL_TOKENS);

        return res.status(200).send(isEligibleForExport);
    } catch (error) {
        console.error(error);
        res.sendStatus(500); // Set an appropriate error status code
    }
});

// Start the server
app.listen(process.env.PORT, () => {
    console.log(`Server started on ${process.env.DOMAIN}:${process.env.PORT}`);
});
