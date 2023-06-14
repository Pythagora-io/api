const express = require('express');
const router = express.Router();
const User = require('../models/User.js')


router.get('/', (req, res) => {
    res.status(200).json({username: req.user ? req.user.username : undefined});
});

router.post('/login', (req, res, next) => {
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
            res.status(200).json({ message: 'Login successful' });
        });
    })(req, res, next);
});

router.post('/register', async (req, res) => {
    try {
        if (req.body.apiKey !== process.env.API_KEY) return res.status(403).send('Forbidden. Need to send apiKey inside body.');

        if (!req.body.username || !req.body.password || !req.body.email) return res.status(400).send('You need to provide username, password and email!');

        let user = new User({ username: req.body.username, password: req.body.password, email: req.body.email, role: req.body.role });
        user.setRoleProperties();
        await user.save();

        // Create session for the user
        req.login(user, (err) => {
            if (err) {
                return res.status(400).send(err);
            }
            res.status(200).json({ message: 'Registration successful', apiKey: user.apiKey });
        });
    } catch (err) {
        res.status(500).send('Error registering user: ', err);
    }
});

module.exports = router;
