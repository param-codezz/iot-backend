const WebSocket = require('ws');
const uuid = require('uuid')
require('dotenv').config();
const { getUserByUsername, createUser, getUserByESP_UID, updateUserAlert, updatePollingRate, updateLastAlert } = require('./services/db_service');
const sendMail = require('./services/mail_service');

const wss = new WebSocket.Server({
    port: 8080,
});

const x64Clients = {};
const ESP32Clients = {};

const mappedClients = {};

const x64_SECRET = process.env.x64_SECRET;
const ESP32_SECRET = process.env.ESP32_SECRET;

// server
wss.on('connection', (ws) => {
    console.log('New client connected');
    ws.clientID = null;
    ws.isRegistered = false;
    ws.user = null;
    ws.esp_UID = null;

    // handle full duplex server connection
    ws.on('message', (data) => {
        const json = JSON.parse(data);
        const user = json.user;
        const secret = json.secret;
        if (!ws.isRegistered) {
            if (isESP32user(user) && checkESP32SecretKey(secret)) {
                ws.clientID = uuid.v4();
                ESP32Clients[ws.clientID] = ws;
                ws.isRegistered = true;
                ws.user = user;
                ws.esp_UID = json.esp_UID;
                if (!mappedClients[json.esp_UID]) {
                    mappedClients[json.esp_UID] = { x64: null, esp32: ws.clientID };
                } else {
                    if (mappedClients[json.esp_UID].x64) {
                        console.log(`An x64 client is already mapped to esp_UID: ${json.esp_UID}`);
                    }
                    mappedClients[json.esp_UID].esp32 = ws.clientID;
                }
                console.log(mappedClients);
                ESP32messageIO(ws, json);
            } else if (isx64user(user) && checkx64SecretKey(secret)) {
                ws.clientID = uuid.v4();
                x64Clients[ws.clientID] = ws;
                ws.isRegistered = true;
                ws.user = user;
                console.log(json);
                ws.esp_UID = json.esp_UID;
                if (!mappedClients[json.esp_UID]) {
                    mappedClients[json.esp_UID] = { x64: ws.clientID, esp32: null };
                } else {
                    if (mappedClients[json.esp_UID].esp32) {
                        console.log(`An x64 client is already mapped to esp_UID: ${json.esp_UID}`);
                    }
                    mappedClients[json.esp_UID].x64 = ws.clientID;
                }
                console.log(mappedClients);
                x64messageIO(ws, json);
            }
        } else {
            // console.log(`Client already registered with ID: ${ws.clientID}`);
            if (isESP32user(user) && checkESP32SecretKey(secret)) {
                console.log(mappedClients);
                ESP32messageIO(ws, json);
            } else if (isx64user(user) && checkx64SecretKey(secret)) {
                console.log(mappedClients);
                x64messageIO(ws, json);
            }
        }
    });

    // handle close connection
    ws.on('close', () => {
        if (ws.isRegistered) {
            const espUID = ws.esp_UID;
            if (isESP32user(ws.user)) {
                delete ESP32Clients[ws.clientID];

                if (mappedClients[espUID]) {
                    mappedClients[espUID].esp32 = null;
                }
            } else if (isx64user(ws.user)) {
                delete x64Clients[ws.clientID];
                console.log(`Client with ID: ${ws.clientID} has disconnected.`);

                if (mappedClients[espUID]) {
                    mappedClients[espUID].x64 = null;
                }
            }
        }
    });

});

// * ESP32
const checkESP32SecretKey = (key) => key === ESP32_SECRET;
const isESP32user = (user) => user === 'esp32';
const ESP32messageIO = async (ws, json) => {
    console.log(json.event);
    if (json.event === 'initialise') {
        const user = await getUserByESP_UID(json.esp_UID);
        if (user != undefined) {
            sendMessageToClient('ESP32', ws.clientID, JSON.stringify({
                connection: true,
                polling: user.polling,
            }));
        } else {
            sendMessageToClient('ESP32', ws.clientID, JSON.stringify({
                connection: false,
            }));
        }
    }
    if (json.event === "alert") {
        console.log('alert')
        const user = await getUserByESP_UID(json.esp_UID);
        if (user != undefined) {
            const alert = user.alert;
            const currentTime = new Date().toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).replace(',', '');
            json.data.alert_sensor.forEach(
                (sensor) => {
                    if (alert) {
                        alert[sensor] = {
                            "status": "Alert",
                            "last_alert": currentTime
                        }
                    }
                }
            );
            // console.log(alert)
            if (await updateUserAlert(json.data.esp_UID, alert)) {
                sendMessageToClient('ESP32', ws.clientID, JSON.stringify({
                    ack: true
                }));
                sendMessageToClient('x64', mappedClients[json.esp_UID].x64, JSON.stringify({
                    event: 'alert',
                    data: {
                        time: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
                        alert: alert,
                    }
                }));
                console.log("sent to mobile");

                const last_alert = new Date(user.last_alert);
                const now = new Date();
                const lastAlertIST = new Date(last_alert.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
                const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

                const timeDiff = Math.abs(nowIST - lastAlertIST) / 1000;

                if (timeDiff > 5) {
                    await sendMail(user.email, 'Suspicious Activity in Room', `Dear ${user.username},\nWe have detected a suspicious activity in the room, please check the My Home App for more details, or contact emergency helplines.\n\nRegards,\nMy Home Team`);
                }
                await updateLastAlert(json.esp_UID, currentTime);
            } else {
                sendMessageToClient('ESP32', ws.clientID, JSON.stringify({
                    ack: false
                }));
            }
        }
    }
    if (json.event === 'sensor_data') {
        const user = await getUserByESP_UID(json.esp_UID);
        const sensorData = json.data;
        if (user != undefined) {
            // console.log(json);
            sendMessageToClient('ESP32', ws.clientID, JSON.stringify({
                ack: true
            }));
            // console.log(JSON.stringify({
            //     event: "sensor_data",
            //     sensor_data: sensorData
            // }));
            sendMessageToClient('x64', mappedClients[json.esp_UID].x64, JSON.stringify({
                event: "sensor_data",
                sensor_data: sensorData
            }));
        }
    }
    if (json.event === 'pong') {
        sendMessageToClient('x64', mappedClients[json.esp_UID].x64, JSON.stringify({
            event: 'pong',
        }));
    }
};

// * x64 devices
const isx64user = (user) => user === 'x64';
const checkx64SecretKey = (key) => key === x64_SECRET;
const x64messageIO = async (ws, json) => {
    // if (json.event === 'ping') {
    //     if (mappedClients[json.esp_UID].esp32 != undefined) {
    //         const data = {
    //             event: 'pong'
    //         };
    //         sendMessageToClient('x64', ws.clientID, JSON.stringify(data));
    //         console.log('pong')
    //     }
    // }
    console.log(json);
    if (json.event === 'login') {
        const data = {}
        console.log(json.data.username);
        const user = await getUserByUsername(json.data.username);
        console.log(`user: ${user}`)
        if (user != null) {
            if (json.data.username === user.username && json.data.password === user.password) {
                data.login = 'true';
                console.log('logged in');
            } else {
                data.login = 'false';
                console.log('logged in failed');
            }
            sendMessageToClient('x64', ws.clientID, JSON.stringify(data));
        }
    }
    if (json.event === 'create_account') {
        const data = {}
        if (json.data.username && json.data.password && json.data.email && json.data.esp_UID) {
            if (await createUser(json.data.username, json.data.email, json.data.password, json.data.esp_UID)) {
                data['create_account'] = true;
            } else {
                data["create_account"] = false;
            }
        } else {
            data["create_account"] = false;
        }
        console.log(JSON.stringify(data));
        sendMessageToClient('x64', ws.clientID, JSON.stringify(data));
    }
    if (json.event === 'change_polling_rate') {
        const user = await getUserByUsername(json.esp_UID);
        if (user != undefined) {
            const pollingRate = json.data.polling_rate;
            updatePollingRate(json.espUID, pollingRate);
            sendMessageToClient('x64', mappedClients[json.esp_UID].x64, JSON.stringify({
                polling_rate: pollingRate
            }));
            sendMessageToClient('ESP32', mappedClients[json.esp_UID].esp32, JSON.stringify({
                polling_rate: pollingRate
            }));
        }
    }
    if (json.event === 'authenticate') {
        const user = await getUserByUsername(json.data.username);
        if (user != undefined) {
            if (json.data.username === user.username && json.data.password === user.password) {
                sendMessageToClient('x64', ws.clientID, JSON.stringify({
                    authenticate: true
                }));
            } else {
                sendMessageToClient('x64', ws.clientID, JSON.stringify({
                    authenticate: false
                }));
            }
        } else {
            sendMessageToClient('x64', ws.clientID, JSON.stringify({
                authenticate: false
            }));
        }
    }
    if (json.event === 'ping') {
        try {

            if (mappedClients[json.esp_UID].esp32) {
                sendMessageToClient('x64', ws.clientID, JSON.stringify({
                    event: 'pong'
                }));
                console.log('ping');
            }
        } catch (e) {
            sendMessageToClient('x64', ws.clientID, JSON.stringify({
                event: 'fail'
            }));
        }
    } if (json.event === 'hidden_ping') {
        try {

            if (mappedClients[json.esp_UID].esp32) {
                sendMessageToClient('x64', ws.clientID, JSON.stringify({
                    event: 'hidden_pong'
                }));
                console.log('ping');
            }
        } catch (e) {
            sendMessageToClient('x64', ws.clientID, JSON.stringify({
                event: 'fail'
            }));
        }
    }
};

const sendMessageToClient = (platform, clientID, json) => {
    const clientWS = platform === 'ESP32' ? ESP32Clients[clientID] : x64Clients[clientID];
    if (clientWS) clientWS.send(json);
}