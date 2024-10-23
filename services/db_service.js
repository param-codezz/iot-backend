const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect('mongodb+srv://iothome121:sGkIS9yi7uYqWgRt@home.a60gc.mongodb.net/?retryWrites=true&w=majority&appName=Home')
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));

const userSchema = new mongoose.Schema({
    username: {type: String, required: true, unique: true},
    email: {type: String},
    password: {type: String},
    esp_UID: {type: String, required: true, unique: true},
    alert: {type: Object, default: {}},
    polling: {type: Number},
    last_alert: {type: String},
    created_at: {
        type: Date,
        default: Date.now
    }
}, {minimize: false});

const User = mongoose.models.User || mongoose.model('User', userSchema);

const createUser = async (username, email, password, esp_UID) => {
    try {
        const newUser = new User({
            username: username,
            email: email,
            password: password,
            esp_UID: esp_UID,
            alert: {},
            polling: 60
        });

        const result = await newUser.save();
        return true;
    } catch (error) {
        return false;
    }
};

const getUserByUsername = async (userName) => {
    try {
        const user = await User.findOne({ username: userName });
        if (user) {
            return user;
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
};

const getUserByESP_UID = async (esp_Uid) => {
    try {
        const user = await User.findOne({ esp_UID: esp_Uid });
        if (user) {
            return user;
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
};

const updateUserAlert = async (esp_UID, alert) => {
    try {
        const user = await User.updateOne({esp_UID: esp_UID}, {alert: alert});
        return true;
    } catch (error) {
        return false;
    }
}

const updatePollingRate = async (esp_UID, polling) => {
    try {
        const user = await User.findOne({ esp_UID: esp_UID });
        user.polling = polling;
        await user.save();
        return true;
    } catch (error) {
        return false;
    }
}

const updateLastAlert = async (esp_UID, time) => {
    try {
        const user = await User.findOne({ esp_UID: esp_UID });
        user.last_alert = time;
        await user.save();
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = { createUser, getUserByUsername, getUserByESP_UID, updateUserAlert, updatePollingRate, updateLastAlert };