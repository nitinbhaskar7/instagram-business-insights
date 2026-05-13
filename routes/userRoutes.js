import express from "express";


const router = express.Router();

import { User } from "../models/User.js";

// CREATE USER
router.post("/create", async (req, res) => {
    try {
        const { userId, username, access_token} = req.body;

        let user = await User.findOne({ userId });

        if (!user) {
            user = await User.create({
                userId,
                username,
                access_token
            });
        }

        res.json(user);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});


// UPDATE AUTO DM SETTINGS
router.post("/auto-dm", async (req, res) => {
    try {
        const {
            userId,
            enableAutoDM,
            message
        } = req.body;

        const user = await User.findOneAndUpdate( 
            { userId },
            {
                enableAutoDM,
                message:
                    enableAutoDM === "static"
                        ? message
                        : ""
            },
            { new: true }
        );

        res.json(user);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});


// GET USER
router.get("/:userId", async (req, res) => {
    try {
        console.log("Fetching user with ID:", req.params.userId);
        const user = await User.findOne({
            // or check webhookId if needed
                $or: [
                    { userId: req.params.userId },
                    { webhookId: req.params.userId }
                ]
        });
        console.log("User found:", user);
        res.json(user);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

export default router;