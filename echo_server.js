const WebSocket = require('ws');

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

// Object to store connected clients by type
let clients = {
    esp32: [],
    android: []
};

// Handle WebSocket connection
wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        try {
            // Try to parse JSON data
            const data = JSON.parse(message.toString());
            console.log(data);
            // Check the type of client based on the JSON data
            //   if (data.device === "ESP32") {
            //     console.log('ESP32 connected');
            //     clients.esp32.push(ws);  // Add to ESP32 clients
            //   } else if (data.device === "Android") {
            //     console.log('Android connected');
            //     clients.android.push(ws);  // Add to Android clients
            //   }

            // Log the message received
            console.log(`Received from ${data.device}:`, data);

        } catch (error) {
            console.log('Received non-JSON message:', message);
        }

        // Echo the message back to the client
        ws.send(`Echo: ${message}`);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        // Optionally, remove the disconnected client from the array
    });
});

console.log('WebSocket server running on ws://localhost:8080');