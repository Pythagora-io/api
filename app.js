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
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();
dotenv.config();


mongoose.connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Failed to connect to MongoDB:', err));

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

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
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

if (process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET)
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
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Start the server
app.listen(process.env.PORT, () => {
    console.log(`Server started on ${process.env.DOMAIN}:${process.env.PORT}`);
});
