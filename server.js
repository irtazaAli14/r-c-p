// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');
// const pool = require('./db');
// // const { v4: uuidv4 } = require('uuid'); // Room ID generate karne ke liye

// const app = express();
// app.use(cors());
// app.use(express.json());

// const server = http.createServer(app);

// const io = new Server(server, {
//     cors: {
//         origin: "*",
//         methods: ["GET", "POST"]
//     }
// });

// app.get('/', (req, res) => {
//     res.send('RandomCall Backend is Running!');
// });

// io.on('connection', async (socket) => {
//     console.log(`\n====================================`);
//     console.log(`Naya socket connect hua: ${socket.id}`);

//     try {
//         // User ko DB me insert karna
//         const insertQuery = `
//       INSERT INTO users (socket_id, status)
//       VALUES ($1, 'online')
//       RETURNING id, status;
//     `;
//         const result = await pool.query(insertQuery, [socket.id]);
//         const newUser = result.rows[0];

//         console.log(`User DB me insert ho gaya! ID: ${newUser.id}`);
//         socket.dbUserId = newUser.id;

//     } catch (err) {
//         console.error("User insert karne me error aya:", err.message);
//     }

//     // ----------------------------------------------------
//     // EVENT: START SEARCHING (User clicked Start button)
//     // ----------------------------------------------------
//     socket.on('start_searching', async () => {
//         if (!socket.dbUserId) return;

//         console.log(`\nUser ${socket.id} is searching for a match...`);

//         try {
//             // Step 1: Pehle apna status 'searching' karo
//             await pool.query("UPDATE users SET status = 'searching' WHERE id = $1", [socket.dbUserId]);

//             // Step 2: Kisi dusre 'searching' user ko dhoondo (Database Transaction use karenge safety ke liye)
//             const client = await pool.connect();
//             try {
//                 await client.query('BEGIN');

//                 // SELECT FOR UPDATE lagaya hai taaki ye row lock ho jaye aur koi dusra socket ise match na kar le (Race condition safety)
//                 const findPartnerQuery = `
//           SELECT id, socket_id FROM users 
//           WHERE status = 'searching' AND id != $1 
//           LIMIT 1 
//           FOR UPDATE SKIP LOCKED;
//         `;
//                 const partnerResult = await client.query(findPartnerQuery, [socket.dbUserId]);

//                 if (partnerResult.rows.length > 0) {
//                     const partner = partnerResult.rows[0];
//                     const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

//                     // Dono ka status 'in_chat' kar do
//                     await client.query("UPDATE users SET status = 'in_chat' WHERE id IN ($1, $2)", [socket.dbUserId, partner.id]);

//                     // Chats table me entry dalo
//                     const createChatQuery = `
//     INSERT INTO chats (room_id, user1_id, user2_id)
//     VALUES ($1, $2, $3);
//   `;
//                     await client.query(createChatQuery, [roomId, socket.dbUserId, partner.id]);

//                     await client.query('COMMIT');

//                     console.log(`MATCH FOUND! Room: ${roomId}`);

//                     // Dono users ko socket room me join karwao
//                     socket.join(roomId);

//                     const partnerSocket = io.sockets.sockets.get(partner.socket_id);
//                     if (partnerSocket) {
//                         partnerSocket.join(roomId);
//                     }

//                     // Socket (User 1 - Creator) ko batayein ki aap CALL INITIATOR ho
//                     socket.emit('match_found', { roomId: roomId, isInitiator: true });

//                     // Partner Socket (User 2) ko batayein ki aap RECEIVER ho
//                     if (partnerSocket) {
//                         partnerSocket.emit('match_found', { roomId: roomId, isInitiator: false });
//                     }
//                 } else {
//                     // Koi match nahi mila, wait karega
//                     await client.query('COMMIT');
//                     socket.emit('waiting', { message: 'Searching for a stranger...' });
//                 }
//             } catch (transactionErr) {
//                 await client.query('ROLLBACK');
//                 throw transactionErr;
//             } finally {
//                 client.release();
//             }

//         } catch (err) {
//             console.error("Matching me error aya:", err.message);
//         }
//     });

//     // Helper functions to handle clean-up inside server.js
//     async function handleUserExit(socketId, roomId) {
//         try {
//             await client.query("BEGIN");

//             // Active match table (chats) se room delete karein
//             await client.query("DELETE FROM chats WHERE room_id = $1", [roomId]);

//             // Dono users ko database me wapas "online" ya reset state me dalein
//             await client.query(
//                 "UPDATE users SET status = 'online' WHERE socket_id = $1",
//                 [socketId]
//             );

//             await client.query("COMMIT");
//         } catch (e) {
//             await client.query("ROLLBACK");
//             console.error("Error cleaning database on exit:", e);
//         }
//     }

//     // 1. User clicks "Stop Streaming"
//     socket.on('leave_chat', async (data) => {
//         console.log(`User ${socket.id} wants to stop streaming in room: ${data.roomId}`);

//         // Partner ko notify karein ki user ne stream chor di hai
//         socket.to(data.roomId).emit('partner_disconnected', {
//             message: "Stranger left the chat. 😭"
//         });

//         // DB clean up
//         await handleUserExit(socket.id, data.roomId);

//         // Socket room leave karein
//         socket.leave(data.roomId);
//     });

//     // 2. User clicks "Find Someone New"
//     socket.on('leave_and_find_new', async (data) => {
//         console.log(`User ${socket.id} is searching for a new stranger...`);

//         // Pehle purane partner ko notify karke nikalen
//         socket.to(data.roomId).emit('partner_disconnected', {
//             message: "Stranger left to find someone new. 🔍"
//         });

//         // Active room clean up karein
//         await handleUserExit(socket.id, data.roomId);
//         socket.leave(data.roomId);

//         // Dynamic sequence check: Is user ko queue me queue_position update de kar search restart karwayein
//         try {
//             await client.query(
//                 "UPDATE users SET status = 'searching' WHERE socket_id = $1",
//                 [socket.id]
//             );

//             // Search procedure execute karein (jo start_searching event me likha hai)
//             // trigger match function...
//             socket.emit('waiting', { message: "Looking for a new match... 🔍" });

//             // Yahan par aapka matching function initiate hona chahiye jo queue check karega
//             triggerMatchingProcess(socket);
//         } catch (err) {
//             console.error("Error setting up new search on leave_and_find_new:", err);
//         }
//     });
//     // 1. Initiate Call (Dono users ke socket room join karne ke baad thoda delay dekar offer send karenge)
//     socket.on('initiate_call', (data) => {
//         // 500ms ka delay taaki socket rooms properly initialize ho jayein
//         setTimeout(() => {
//             socket.emit('send_offer');
//         }, 500);
//     });

//     // 2. Forward SDP Offer to Partner
//     socket.on('sdp_offer', (data) => {
//         socket.to(data.roomId).emit('receive_offer', { sdp: data.sdp });
//     });

//     // 3. Forward SDP Answer to Partner
//     socket.on('sdp_answer', (data) => {
//         socket.to(data.roomId).emit('receive_answer', { sdp: data.sdp });
//     });

//     // 4. Forward ICE Candidate to Partner
//     socket.on('ice_candidate', (data) => {
//         socket.to(data.roomId).emit('receive_ice_candidate', { candidate: data.candidate });
//     });

//     // Disconnect Cleanup
//     socket.on('disconnect', async () => {
//         console.log(`\n====================================`);
//         console.log(`User disconnect ho gaya: ${socket.id}`);

//         if (socket.dbUserId) {
//             try {
//                 // Disconnect hone se pehle check karo kya ye kisi active chat me tha?
//                 const activeChatQuery = `
//           SELECT room_id FROM chats 
//           WHERE (user1_id = $1 OR user2_id = $1) AND is_active = TRUE;
//         `;
//                 const chatResult = await pool.query(activeChatQuery, [socket.dbUserId]);

//                 if (chatResult.rows.length > 0) {
//                     const roomId = chatResult.rows[0].room_id;

//                     // Samne wale partner ko inform karo ki "Stranger has disconnected"
//                     socket.to(roomId).emit('partner_disconnected');
//                 }

//                 // DB se delete kar do
//                 await pool.query(`DELETE FROM users WHERE id = $1;`, [socket.dbUserId]);
//                 console.log(`User successfully deleted from DB.`);
//             } catch (err) {
//                 console.error("Disconnect cleanup error:", err.message);
//             }
//         }
//     });
// });

// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });



/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================
/// ===================================================


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.get('/', (req, res) => {
    res.send('RandomCall Backend is Running!');
});

// Helper Function: Safe DB Cleanup on Exit or Leave
async function handleUserExit(socketId, roomId) {
    try {
        // chats table se vo specific room delete karein
        await pool.query("DELETE FROM chats WHERE room_id = $1", [roomId]);

        // Jis user ne exit kiya use wapas 'online' (ya empty) state par le aayein
        await pool.query(
            "UPDATE users SET status = 'online' WHERE socket_id = $1",
            [socketId]
        );
    } catch (e) {
        console.error("Error cleaning database on exit:", e.message);
    }
}

// Helper Function: Pure matching process ko handle karne ke liye (Reusable)
async function matchUser(socket) {
    if (!socket.dbUserId) return;

    try {
        // Step 1: Status ko 'searching' update karein
        await pool.query("UPDATE users SET status = 'searching' WHERE id = $1", [socket.dbUserId]);

        // Step 2: Queue matching logic (using transaction with row lock)
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const findPartnerQuery = `
                SELECT id, socket_id FROM users 
                WHERE status = 'searching' AND id != $1 
                LIMIT 1 
                FOR UPDATE SKIP LOCKED;
            `;
            const partnerResult = await client.query(findPartnerQuery, [socket.dbUserId]);

            if (partnerResult.rows.length > 0) {
                const partner = partnerResult.rows[0];
                const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                // Dono users ka status 'in_chat' set karein
                await client.query("UPDATE users SET status = 'in_chat' WHERE id IN ($1, $2)", [socket.dbUserId, partner.id]);

                // Chats entry log karein
                const createChatQuery = `
                    INSERT INTO chats (room_id, user1_id, user2_id)
                    VALUES ($1, $2, $3);
                `;
                await client.query(createChatQuery, [roomId, socket.dbUserId, partner.id]);

                await client.query('COMMIT');

                console.log(`MATCH FOUND! Room: ${roomId}`);

                // Rooms Join karwayein
                socket.join(roomId);
                const partnerSocket = io.sockets.sockets.get(partner.socket_id);
                if (partnerSocket) {
                    partnerSocket.join(roomId);
                }

                // Signals trigger karein
                socket.emit('match_found', { roomId: roomId, isInitiator: true });
                if (partnerSocket) {
                    partnerSocket.emit('match_found', { roomId: roomId, isInitiator: false });
                }
            } else {
                await client.query('COMMIT');
                socket.emit('waiting', { message: 'Searching for a stranger...' });
            }
        } catch (transactionErr) {
            await client.query('ROLLBACK');
            throw transactionErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Matching process error:", err.message);
    }
}

io.on('connection', async (socket) => {
    console.log(`\n====================================`);
    console.log(`Naya socket connect hua: ${socket.id}`);

    try {
        const insertQuery = `
            INSERT INTO users (socket_id, status)
            VALUES ($1, 'online')
            RETURNING id, status;
        `;
        const result = await pool.query(insertQuery, [socket.id]);
        const newUser = result.rows[0];

        console.log(`User DB me insert ho gaya! ID: ${newUser.id}`);
        socket.dbUserId = newUser.id;

    } catch (err) {
        console.error("User insert karne me error aya:", err.message);
    }

    // ----------------------------------------------------
    // EVENT: START SEARCHING
    // ----------------------------------------------------
    socket.on('start_searching', async () => {
        await matchUser(socket);
    });

    // ----------------------------------------------------
    // EVENT: STOP STREAMING (leave_chat)
    // ----------------------------------------------------
    socket.on('leave_chat', async (data) => {
        console.log(`User ${socket.id} wants to stop streaming in room: ${data.roomId}`);

        // Partner ko alert karein aur reset karein
        socket.to(data.roomId).emit('partner_disconnected', {
            message: "Stranger left the chat. 😭"
        });

        // Database cleanup call safely using global pool
        await handleUserExit(socket.id, data.roomId);
        socket.leave(data.roomId);
    });

    // ----------------------------------------------------
    // EVENT: FIND SOMEONE NEW (leave_and_find_new)
    // ----------------------------------------------------
    socket.on('leave_and_find_new', async (data) => {
        console.log(`User ${socket.id} is leaving room ${data.roomId} to find a new stranger...`);

        // Dusre partner ki video stop karein aur use alert bhejeyin
        socket.to(data.roomId).emit('partner_disconnected', {
            message: "Stranger left to find someone new. 🔍"
        });

        // Current room state clear karein
        await handleUserExit(socket.id, data.roomId);
        socket.leave(data.roomId);

        // Instant naya match initiate karein
        socket.emit('waiting', { message: "Looking for a new match... 🔍" });
        await matchUser(socket);
    });

    // ----------------------------------------------------
    // WEBRTC SIGNALING HANDLERS
    // ----------------------------------------------------
    socket.on('initiate_call', (data) => {
        setTimeout(() => {
            socket.emit('send_offer');
        }, 500);
    });

    socket.on('sdp_offer', (data) => {
        socket.to(data.roomId).emit('receive_offer', { sdp: data.sdp });
    });

    socket.on('sdp_answer', (data) => {
        socket.to(data.roomId).emit('receive_answer', { sdp: data.sdp });
    });

    socket.on('ice_candidate', (data) => {
        socket.to(data.roomId).emit('receive_ice_candidate', { candidate: data.candidate });
    });

    // Disconnect Cleanup
    socket.on('disconnect', async () => {
        console.log(`\n====================================`);
        console.log(`User disconnect ho gaya: ${socket.id}`);

        if (socket.dbUserId) {
            try {
                const activeChatQuery = `
                    SELECT room_id FROM chats 
                    WHERE (user1_id = $1 OR user2_id = $1);
                `;
                const chatResult = await pool.query(activeChatQuery, [socket.dbUserId]);

                if (chatResult.rows.length > 0) {
                    const roomId = chatResult.rows[0].room_id;
                    socket.to(roomId).emit('partner_disconnected', {
                        message: "Stranger disconnected. 😭"
                    });
                    await handleUserExit(socket.id, roomId);
                }

                await pool.query(`DELETE FROM users WHERE id = $1;`, [socket.dbUserId]);
                console.log(`User successfully deleted from DB.`);
            } catch (err) {
                console.error("Disconnect cleanup error:", err.message);
            }
        }
    });


    socket.on("send-chat-message", ({ room, message }) => {
        // Apne se hat kar room ke doosre connection ko message data forward karein
        socket.to(room).emit("receive-chat-message", message);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});